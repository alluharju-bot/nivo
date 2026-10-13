import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Project } from '../model/project';
import { uid } from '../model/project';
import { cloudClient, cloudConfigured, cloudServer } from './client';
import { readBinding, writeBinding, removeBinding } from './bindings';
import { supabaseRemote } from './remote';
import { synchronizeProject } from './sync';
import type { CloudBinding, CloudHead, SyncResult } from './types';
import { loadLocalSession, type LocalSession } from '../storage/projects';
import { projectRevision } from '../storage/projectTransfer';
import { saveRevision } from '../storage/revisions';

export function useCloud(project: Project, flushSave: () => Promise<void>) {
  const [user, setUser] = useState<User>();
  const [result, setResult] = useState<SyncResult>({ kind: 'disabled' });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [entries, setEntries] = useState<CloudHead[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [pulse, setPulse] = useState(0);
  const current = useRef({ project, flushSave, user });
  current.current = { project, flushSave, user };
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!cloudConfigured) return;
    let stop = false,
      unsubscribe: (() => void) | undefined;
    void cloudClient()
      .then((client) => {
        if (stop) return;
        const { data } = client.auth.onAuthStateChange((_event, session) => {
          if (!stop) setUser((old) => (old?.id === session?.user.id ? old : session?.user));
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch((e) => {
        if (!stop) setError(e.message);
      });
    return () => {
      stop = true;
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    setEntries([]);
    setError('');
  }, [user?.id]);
  const scope = user ? `${cloudServer}|${user.id}` : '';
  const guard = (id: string) => {
    if (!mounted.current || current.current.user?.id !== id)
      throw new Error('Pilvitili vaihtui. Toiminto keskeytettiin.');
  };
  const run = useCallback((action: () => Promise<void>) => {
    const next = queue.current
      .catch(() => {})
      .then(async () => {
        if (!mounted.current) return;
        setWorking(true);
        setError('');
        try {
          await action();
        } catch (e) {
          if (mounted.current)
            setError(
              (e as Error).message || 'Pilviyhteys epäonnistui. Paikallinen tallennus säilyy.',
            );
        } finally {
          if (mounted.current) setWorking(false);
        }
      });
    queue.current = next;
    return next;
  }, []);
  const rememberHead = useCallback((head: CloudHead) => {
    setEntries((old) =>
      [head, ...old.filter((entry) => entry.id !== head.id)].sort((a, b) =>
        b.updated_at.localeCompare(a.updated_at),
      ),
    );
  }, []);
  const sync = useCallback(
    () =>
      run(async () => {
        const state = current.current;
        if (!state.user) return;
        const owner = state.user.id,
          account = `${cloudServer}|${owner}`;
        await state.flushSave();
        guard(owner);
        if (current.current.project.id !== state.project.id) return;
        const saved = await loadLocalSession(state.project.id, false);
        if (
          !saved ||
          (await projectRevision(saved.project)) !== (await projectRevision(state.project))
        )
          throw new Error(
            'Projektia on muutettu toisessa välilehdessä. Avaa uusin paikallinen versio ennen synkronointia.',
          );
        if (current.current.project !== state.project) return;
        const binding = await readBinding(account, state.project.id);
        if (!binding) {
          setResult({ kind: 'disabled' });
          return;
        }
        const remote = supabaseRemote(await cloudClient(), owner);
        const next = await synchronizeProject(state.project, binding, remote, async (b) => {
          guard(owner);
          // A queued pause must finish after this acknowledgement, not before it.
          await writeBinding(b);
        });
        guard(owner);
        if ('head' in next) rememberHead(next.head);
        if (current.current.project === state.project) setResult(next);
      }),
    [run, rememberHead],
  );
  useEffect(() => {
    let stop = false;
    setEnabled(false);
    setResult({ kind: 'disabled' });
    setNotice('');
    if (scope)
      void readBinding(scope, project.id)
        .then((b) => {
          if (!stop) setEnabled(!!b);
        })
        .catch((e) => {
          if (!stop) setError(e.message);
        });
    return () => {
      stop = true;
    };
  }, [scope, project.id, pulse]);
  useEffect(() => {
    if (!enabled || !user) return;
    setResult({ kind: 'pending' });
    const timer = window.setTimeout(() => void sync(), 3000);
    return () => clearTimeout(timer);
  }, [project, enabled, user?.id, sync]);
  useEffect(() => {
    if (!enabled || !user) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled, user?.id, sync]);
  const refresh = () =>
    run(async () => {
      if (!user) return;
      const list = await supabaseRemote(await cloudClient(), user.id).list();
      guard(user.id);
      setEntries(list);
    });
  const enable = () =>
    run(async () => {
      if (!user) return;
      await flushSave();
      guard(user.id);
      if (current.current.project.id !== project.id) return;
      if (!(await readBinding(scope, project.id)))
        await writeBinding({ scope, localId: project.id, remoteId: uid() });
      setPulse((n) => n + 1);
    });
  const pause = () =>
    run(async () => {
      if (!user) return;
      await removeBinding(scope, project.id);
      guard(user.id);
      setPulse((n) => n + 1);
    });
  const fork = (onOpen: (session: LocalSession) => Promise<boolean>) =>
    run(async () => {
      if (!user) return;
      await flushSave();
      guard(user.id);
      const local = {
        ...project,
        id: uid(),
        name: `${project.name.slice(0, 95)} · rinnakkainen versio`,
      };
      const remoteId = uid();
      const remote = supabaseRemote(await cloudClient(), user.id);
      const binding = { scope, localId: local.id, remoteId };
      let acknowledged: CloudBinding | undefined;
      const next = await synchronizeProject(local, binding, remote, async (b) => {
        acknowledged = b;
      });
      guard(user.id);
      if (await onOpen({ project: local })) {
        guard(user.id);
        if (acknowledged) await writeBinding(acknowledged);
        setPulse((n) => n + 1);
        setResult(next);
        if ('head' in next) rememberHead(next.head);
        setNotice('Molemmat versiot säilyivät pilvessä. Tämä malli jatkaa omana projektinaan.');
      }
    });
  const open = (head: CloudHead, onOpen: (session: LocalSession) => Promise<boolean>) =>
    run(async () => {
      if (!user) return;
      await flushSave();
      guard(user.id);
      const incoming = await supabaseRemote(await cloudClient(), user.id).read(head);
      guard(user.id);
      // Download into a separate local slot. Existing models and undo history are
      // untouched even when this device has unsynchronized changes.
      const local = { ...incoming, id: uid() };
      if (enabled && result.kind === 'remote' && result.head.id === head.id)
        await saveRevision(project, 'Ennen pilviversion avaamista');
      guard(user.id);
      if (await onOpen({ project: local })) {
        guard(user.id);
        await writeBinding({
          scope,
          localId: local.id,
          remoteId: head.id,
          baseHash: head.hash,
          baseRevision: head.revision,
        });
        setPulse((n) => n + 1);
        setNotice('Pilviversio avattu. Aiempi paikallinen versio säilyi kirjastossa.');
      }
    });
  return {
    configured: cloudConfigured,
    user,
    enabled,
    result,
    working,
    error,
    notice,
    entries,
    refresh,
    sync,
    enable,
    pause,
    fork,
    open,
    signIn: (email: string) =>
      run(async () => {
        const { error } = await (
          await cloudClient()
        ).auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL },
        });
        if (error) throw error;
        setNotice(
          'Kirjautumisviesti lähetetty. Avaa linkki tässä selaimessa tai syötä sähköpostin vahvistuskoodi.',
        );
      }),
    verify: (email: string, token: string) =>
      run(async () => {
        const { error } = await (
          await cloudClient()
        ).auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
        if (error) throw error;
      }),
    signOut: () =>
      run(async () => {
        const { error } = await (await cloudClient()).auth.signOut({ scope: 'local' });
        if (error) throw error;
        setNotice('Kirjauduit ulos. Paikalliset projektit säilyvät tässä selaimessa.');
      }),
  };
}
export type CloudController = ReturnType<typeof useCloud>;
