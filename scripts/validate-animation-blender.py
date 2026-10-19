# Run after tests/animation.spec.ts exports its GLB and reference poses.
# Blender --background --factory-startup --python scripts/validate-animation-blender.py
import bpy, json, os, tempfile
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(tempfile.gettempdir(), 'nivo-blast-door.glb'))
expected = json.load(open(os.path.join(tempfile.gettempdir(), 'nivo-animation-expected.json')))
assert len(bpy.data.actions) == 1
assert bpy.data.actions[0].name == 'BLAST_DOOR_OPEN'
objects = {o.get('nivoId'): o for o in bpy.data.objects if o.get('nivoId')}
assert len(objects) == 3
worst = 0
fps = bpy.context.scene.render.fps / bpy.context.scene.render.fps_base
for sample in expected:
    frame = sample['time'] * fps
    bpy.context.scene.frame_set(int(frame), subframe=frame-int(frame))
    bpy.context.view_layer.update()
    for body in sample['bodies']:
        actual = objects[body['id']].matrix_world.translation
        error = (actual-Vector(body['position'])).length
        worst = max(worst,error)
        assert error < 0.00003, (sample['time'],body['name'],list(actual),body['position'],error)
print('NIVO_BLENDER_VALIDATION', json.dumps({'blender': bpy.app.version_string, 'clip': bpy.data.actions[0].name, 'samples': len(expected), 'bodies': len(objects), 'worstErrorMM': worst*1000, 'fps': fps}))
