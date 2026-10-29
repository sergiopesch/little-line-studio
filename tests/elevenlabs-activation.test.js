import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const program = String.raw`
import copy, hashlib, importlib.util, json, os, shutil, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('activation', 'scripts/activate-elevenlabs.py')
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
real_root, real_probe, real_which = a.ROOT, a.probe_mp3, shutil.which
real_check_output = subprocess.check_output
TEXTS = {'sample':'Hello.', 'cat/head/instruction':'Draw a circle.', 'cat/head/hint':'Try one soft curve.'}
SPEECH = b'ID3' + b'stage-speech' * 200
MUSIC = b'ID3' + b'stage-music' * 200
PLAN = hashlib.sha256(b'fixture plan').hexdigest()

class ActivationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.root_patch = patch.object(a, 'ROOT', self.root)
        self.root_patch.start()
        self.probe_patch = patch.object(a, 'probe_mp3', return_value=1.234)
        self.probe = self.probe_patch.start()
        self.catalogue_patch = patch.object(a, 'catalogue_texts', return_value=TEXTS)
        self.catalogue = self.catalogue_patch.start()
        self.music_registry = {}
        self.music_catalogue_patch = patch.object(a, 'lesson_music_catalogue', side_effect=lambda:self.music_registry)
        self.music_catalogue_patch.start()
        self.tools_patch = patch.object(a.shutil, 'which', return_value='/fixture/ffprobe')
        self.tools_patch.start()
        # These activation fixtures already mock encoding and probing. Keep the
        # encoder-version query independent of the host's optional ffmpeg install.
        def tool_output(command, *args, **kwargs):
            if command == ['ffmpeg', '-version']:
                return 'ffmpeg version activation-fixture\n'
            return real_check_output(command, *args, **kwargs)
        self.version_patch = patch.object(a.subprocess, 'check_output', side_effect=tool_output)
        self.version_patch.start()
        (self.root / '.gitignore').write_text('/media/elevenlabs/\n')
        self.bundle = self.root / 'media/elevenlabs/bundles' / PLAN
        self.bundle.mkdir(parents=True)
        self.header = {'schemaVersion':1, 'provider':'ElevenLabs', 'reviewStatus':'unreviewed-staged-only'}
        self.descriptor = {**self.header, 'planHash':PLAN, 'speechKeys':len(TEXTS), 'musicLevels':[]}
        self.specs = {}
        self.clips = {key:self.clip(SPEECH, 'narration', text) for key,text in TEXTS.items()}
        self.write_bundle()
        self.originals = {}
        for name,value in [('narration-manifest.json', {'old':'manifest'}), ('narration-index.json', {'old':'index'}), ('narration-durations.json', {'old':123}), ('music-index.json', {})]:
            path = self.root / 'src' / name
            path.parent.mkdir(exist_ok=True)
            path.write_text(json.dumps(value)+'\n')
            self.originals[path.relative_to(self.root).as_posix()] = path.read_bytes()
        self.old = self.old_asset('narration', b'old narration one')
        self.notice = self.root / 'public/narration/COPYING.md'
        self.notice.write_text('Existing voice notice remains the owner responsibility.\n')

    def tearDown(self):
        self.version_patch.stop()
        self.music_catalogue_patch.stop()
        self.tools_patch.stop()
        self.catalogue_patch.stop()
        self.probe_patch.stop()
        self.root_patch.stop()
        self.temp.cleanup()

    def clip(self, data, kind, text=None, prompt='Quiet original instrumental fixture.'):
        digest = a.sha(data)
        source = f'/{kind}/clip-{digest}.mp3'
        path = self.bundle / 'assets' / source.lstrip('/')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        model = 'eleven_v4' if kind == 'narration' else 'music_v2_5'
        settings = ({'inputs':[{'text':text,'voice_id':'fixture-selected-voice'}], 'model_id':model}
                    if kind == 'narration' else {'prompt':prompt, 'model_id':model, 'music_length_ms':90000, 'force_instrumental':True})
        request = {'kind':'speech' if kind == 'narration' else 'music',
                   'path':'/v1/text-to-dialogue?output_format=mp3_44100_128' if kind == 'narration' else '/v1/music?output_format=mp3_44100_128',
                   'payload':settings, 'apiContractDate':'2026-10-26', 'encoding':a.ENCODING[kind]}
        if kind == 'narration': request['voiceId']='fixture-selected-voice'
        identity = a.sha(a.canonical(request))
        self.specs[identity] = {**request,'cacheKey':identity,'estimatedUsd':'0'}
        duration=1.234 if kind=='narration' else 90.044
        receipt = {'status':'complete','provider':'ElevenLabs','cacheKey':identity,
                   'apiPath':request['path'],'model':model,'voiceId':request.get('voiceId'),
                   'sha256':digest,'bytes':len(data),'duration':duration}
        cache = self.root/'media/elevenlabs/cache'/identity
        cache.mkdir(parents=True,exist_ok=True)
        (cache/'receipt.json').write_bytes(a.json_bytes(receipt))
        (cache/'normalised.mp3').write_bytes(data)
        result = {'src':source, 'sha256':digest, 'bytes':len(data), 'duration':duration,
                  'provider':'ElevenLabs', 'provenance':'verified-api-response',
                  'model':model, 'cacheKey':identity, 'encoding':a.ENCODING[kind], 'generationSettings':settings}
        if kind == 'narration': result.update(text=text, voiceId='fixture-selected-voice')
        else: result.update(prompt=prompt, instrumentalRequested=True)
        return result

    def write_bundle(self):
        entries = {key:clip['cacheKey'] for key,clip in self.clips.items()}
        music_file=self.bundle/'music-manifest.json'
        if music_file.exists():
            music=json.loads(music_file.read_text())
            beds=music['levels']
            entries.update({f'music/{level}':clip['cacheKey'] for level,clip in beds.items()})
            entries.update({f'music/lesson/{name}':clip['cacheKey'] for name,clip in music.get('lessons',{}).items()})
        plan={'schemaVersion':1,'providerRequested':'ElevenLabs','entries':entries,
              'requests':{identity:self.specs.get(identity,{'cacheKey':identity}) for identity in entries.values()}}
        identity=a.sha(a.canonical(plan))
        destination=self.bundle.parent/identity
        if destination != self.bundle:
            self.bundle.rename(destination)
            self.bundle=destination
        self.descriptor['planHash']=identity
        (self.bundle/'plan.json').write_bytes(a.json_bytes(plan))
        (self.bundle / 'bundle.json').write_bytes(a.json_bytes(self.descriptor))
        (self.bundle / 'narration-manifest.json').write_bytes(a.json_bytes({**self.header,'clips':self.clips}))
        (self.bundle / 'narration-index.json').write_bytes(a.json_bytes({key:clip['src'] for key,clip in self.clips.items()}))

    def old_asset(self, kind, data):
        path = self.root / 'public' / kind / f'clip-{a.sha(data)}.mp3'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def assert_originals(self):
        for name,data in self.originals.items(): self.assertEqual((self.root/name).read_bytes(),data,name)
        self.assertEqual(self.old.read_bytes(),b'old narration one')

    def activation_records(self):
        return list((self.root/'media/elevenlabs/activation-backups').glob('*/activation.json'))

    def test_explicit_review_is_required_before_any_activation_work(self):
        with self.assertRaises(a.SafeError): a.activate(self.bundle)
        self.catalogue.assert_not_called()
        self.probe.assert_not_called()
        self.assert_originals()
        self.assertFalse(self.activation_records())

    def test_complete_activation_copies_first_preserves_notices_and_retires_recoverably(self):
        notice = self.notice.read_bytes()
        result = a.activate(self.bundle/'bundle.json', reviewed=True)
        self.assertEqual(result['status'],'activated')
        self.assertEqual(result['narrationKeys'],len(TEXTS))
        self.assertEqual(result['uniqueAssets'],1)
        self.assertEqual(self.probe.call_count,1,'deduplicated assets are verified once')
        manifest = json.loads((self.root/'src/narration-manifest.json').read_text())
        self.assertEqual(manifest['schemaVersion'],3)
        self.assertEqual(manifest['provider'],'ElevenLabs')
        self.assertEqual(set(manifest['clips']),set(TEXTS))
        self.assertTrue(manifest['review']['operatorConfirmedReviewed'])
        self.assertIn('did not listen',manifest['review']['assertion'])
        self.assertEqual(json.loads((self.root/'src/narration-index.json').read_text()),{key:clip['src'] for key,clip in self.clips.items()})
        self.assertEqual(json.loads((self.root/'src/narration-durations.json').read_text()),{'cat/head/instruction':1234})
        for clip in manifest['clips'].values():
            self.assertEqual(clip['provider'],'ElevenLabs')
            self.assertEqual(clip['provenance'],'verified-api-response')
            self.assertEqual(clip['encoding']['rate'],44100)
            self.assertEqual(clip['encoding']['bitrate'],'128k')
            self.assertEqual(clip['generationSettings']['model_id'],'eleven_v4')
            self.assertEqual((self.root/'public'/clip['src'].lstrip('/')).read_bytes(),SPEECH)
        backup = self.root/result['backup']
        for relative,data in self.originals.items():
            if relative != 'src/music-index.json': self.assertEqual((backup/'metadata'/relative).read_bytes(),data)
        self.assertEqual((backup/'retired'/self.old.relative_to(self.root)).read_bytes(),b'old narration one')
        self.assertFalse(self.old.exists())
        self.assertEqual(self.notice.read_bytes(),notice)
        self.assertEqual((self.root/'src/music-index.json').read_bytes(),self.originals['src/music-index.json'])
        self.assertEqual(json.loads((backup/'activation.json').read_text())['status'],'complete')

    def test_partial_extra_and_changed_transcript_bundles_are_rejected_without_mutation(self):
        original = copy.deepcopy(self.clips)
        variants = []
        missing = copy.deepcopy(original); missing.pop('cat/head/hint'); variants.append(missing)
        extra = copy.deepcopy(original); extra['other/head/instruction']=extra['sample']; variants.append(extra)
        changed = copy.deepcopy(original); changed['cat/head/instruction']['text']='Unreviewed changed instruction.'; variants.append(changed)
        for clips in variants:
            with self.subTest(keys=list(clips)):
                self.clips=clips; self.descriptor['speechKeys']=len(clips); self.write_bundle()
                with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
                self.assert_originals(); self.assertFalse(self.activation_records())

    def test_provenance_hash_path_and_duration_tampering_is_rejected(self):
        original=copy.deepcopy(self.clips)
        for field,value in [('provider','Other'),('provenance','unverified'),('cacheKey','invalid'),('voiceId','../voice'),('src','https://example.invalid/audio.mp3'),('src','/narration/../private.mp3'),('sha256','a'*64),('bytes',len(SPEECH)+1),('duration',35),('duration',0),('duration',True),('duration',float('inf'))]:
            with self.subTest(field=field,value=str(value)):
                self.clips=copy.deepcopy(original); self.clips['sample'][field]=value
                if value == float('inf'):
                    # Malformed standard JSON is rejected before any filesystem write.
                    raw=json.dumps({**self.header,'clips':self.clips})
                    (self.bundle/'narration-manifest.json').write_text(raw)
                else: self.write_bundle()
                with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
                self.assert_originals(); self.assertFalse(self.activation_records())

    def test_asset_bytes_and_index_must_match_the_reviewed_manifest(self):
        asset=self.bundle/'assets'/self.clips['sample']['src'].lstrip('/')
        asset.write_bytes(b'tampered audio')
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        asset.write_bytes(SPEECH)
        (self.bundle/'narration-index.json').write_text('{}')
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.assert_originals()

    def test_plan_settings_cache_identity_and_receipt_provenance_are_verified(self):
        plan_file=self.bundle/'plan.json'
        original=plan_file.read_bytes()
        plan=json.loads(original)
        plan['requests'][self.clips['sample']['cacheKey']]['payload']['inputs'][0]['text']='Changed plan text.'
        plan_file.write_bytes(a.json_bytes(plan))
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        plan_file.write_bytes(original)
        receipt_file=self.root/'media/elevenlabs/cache'/self.clips['sample']['cacheKey']/'receipt.json'
        receipt=json.loads(receipt_file.read_text())
        receipt['status']='pending-unknown'
        receipt_file.write_bytes(a.json_bytes(receipt))
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        receipt['status']='complete';receipt_file.write_bytes(a.json_bytes(receipt))
        cache=receipt_file.parent/'normalised.mp3'
        cache.write_bytes(b'different cached bytes')
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.assert_originals();self.assertFalse(self.activation_records())

    def test_manifest_settings_and_encoding_cannot_disagree_with_hashed_plan(self):
        original=copy.deepcopy(self.clips)
        self.clips['sample']['encoding']={**a.ENCODING['narration'],'rate':22050}
        self.write_bundle()
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.clips=copy.deepcopy(original)
        self.clips['sample']['generationSettings']['inputs'][0]['voice_id']='different-voice'
        self.write_bundle()
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.assert_originals()

    def test_boundary_and_symlink_inputs_or_destinations_are_rejected(self):
        for selected in [self.root, self.root/'media/elevenlabs/bundles/..'/PLAN]:
            with self.assertRaises(a.SafeError): a.activate(selected,reviewed=True)
        asset=self.bundle/'assets'/self.clips['sample']['src'].lstrip('/')
        saved=asset.read_bytes(); asset.unlink()
        outside=self.root/'outside.mp3'; outside.write_bytes(saved)
        asset.symlink_to(outside)
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        asset.unlink(); asset.write_bytes(saved)
        output=self.root/'src/narration-index.json'; output.unlink(); output.symlink_to(self.root/'outside.json')
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.assertFalse((self.root/'outside.json').exists())

    def test_voice_only_activation_leaves_existing_music_and_metadata_untouched(self):
        old_music=self.old_asset('music',b'old selected music')
        index={level:'/music/'+old_music.name for level in a.LEVELS}
        path=self.root/'src/music-index.json'; path.write_bytes(a.json_bytes(index))
        metadata=self.root/'src/music-manifest.json'; metadata.write_text('{"preserve":"existing music"}\n')
        original=metadata.read_bytes()
        a.activate(self.bundle,reviewed=True)
        self.assertEqual(json.loads(path.read_text()),index)
        self.assertEqual(metadata.read_bytes(),original)
        self.assertEqual(old_music.read_bytes(),b'old selected music')

    def music_bundle(self,levels=a.LEVELS,lessons=()):
        self.probe.side_effect=lambda path,kind:90.044 if kind=='music' else 1.234
        self.descriptor['musicLevels']=list(levels)
        self.descriptor['musicLessons']=list(lessons)
        beds={level:self.clip(MUSIC,'music') for level in levels}
        overrides={name:self.clip(MUSIC+name.encode(),'music',prompt=f'Quiet original {name} instrumental fixture.') for name in lessons}
        self.music_registry={name:{'level':'basic','seconds':90,'prompt':f'Quiet original {name} instrumental fixture.'} for name in lessons}
        (self.bundle/'music-manifest.json').write_bytes(a.json_bytes({**self.header,'levels':beds,'lessons':overrides}))
        self.write_bundle()

    def test_music_activates_only_all_three_known_levels_with_per_bed_provenance(self):
        self.music_bundle()
        old=self.old_asset('music',b'old bed')
        result=a.activate(self.bundle,reviewed=True)
        self.assertEqual(result['musicLevels'],list(a.LEVELS))
        manifest=json.loads((self.root/'src/music-manifest.json').read_text())
        index=json.loads((self.root/'src/music-index.json').read_text())
        self.assertEqual(set(index),set(a.LEVELS))
        self.assertEqual(set(manifest['levels']),set(a.LEVELS))
        for level,clip in manifest['levels'].items():
            self.assertEqual(clip['provider'],'ElevenLabs')
            self.assertTrue(clip['instrumentalRequested'])
            self.assertEqual(index[level],clip['src'])
            self.assertEqual((self.root/'public'/clip['src'].lstrip('/')).read_bytes(),MUSIC)
        self.assertFalse(old.exists())
        self.assertEqual((self.root/result['backup']/'retired'/old.relative_to(self.root)).read_bytes(),b'old bed')

    def test_partial_or_unknown_music_levels_cannot_modify_any_active_files(self):
        for levels in [('basic',),('basic','intermediate','unknown')]:
            self.music_bundle(levels)
            with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
            self.assert_originals(); self.assertFalse(self.activation_records())

    def test_loop_option_requires_the_complete_verified_source_library(self):
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True,loop_music=True)
        self.assert_originals(); self.assertFalse(self.activation_records())
        self.music_bundle()
        music=json.loads((self.bundle/'music-manifest.json').read_text())
        source=self.bundle/'assets'/music['levels']['basic']['src'].lstrip('/')
        source.write_bytes(b'changed source')
        with patch.object(a,'derive_music_loop') as derive:
            with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True,loop_music=True)
            derive.assert_not_called()
        self.assert_originals(); self.assertFalse(self.activation_records())

    def test_prepared_loops_use_the_normal_hash_authority_and_atomic_activation(self):
        self.music_bundle()
        def derive(source,data,version):
            self.assertEqual(data,MUSIC)
            data=b'ID3'+b'prepared-loop'*200
            digest=a.sha(data)
            return ({**source,'src':f'/music/clip-{digest}.mp3','sha256':digest,'bytes':len(data),'duration':72,
                     'provenance':'verified-local-derivative','source':source,'processing':{'recipe':a.LOOP_RECIPE}},
                    {'data':data,'duration':72})
        with patch.object(a,'derive_music_loop',side_effect=derive) as prepare:
            result=a.activate(self.bundle,reviewed=True,loop_music=True)
        self.assertEqual(prepare.call_count,3)
        manifest=json.loads((self.root/'src/music-manifest.json').read_text())
        self.assertEqual(manifest['provenance'],'verified-api-sources-with-local-loop-processing')
        index=json.loads((self.root/'src/music-index.json').read_text())
        self.assertEqual(set(index),set(a.LEVELS))
        for level,clip in manifest['levels'].items():
            self.assertEqual(clip['provenance'],'verified-local-derivative')
            self.assertEqual(clip['source']['provenance'],'verified-api-response')
            self.assertEqual(index[level],clip['src'])
            data=(self.root/'public'/clip['src'].lstrip('/')).read_bytes()
            self.assertEqual(a.sha(data),clip['sha256'])
            self.assertFalse((self.root/'public'/clip['source']['src'].lstrip('/')).exists())
        self.assertEqual(result['uniqueAssets'],2)

    def test_reviewed_crop_and_normalization_metadata_are_bound_to_only_their_exact_sources(self):
        self.music_bundle(lessons=('flower','cactus','ladybird'))
        raw=json.loads((self.bundle/'music-manifest.json').read_text())
        flower_sha=raw['lessons']['flower']['sha256']
        cactus_sha=raw['lessons']['cactus']['sha256']
        ladybird_sha=raw['lessons']['ladybird']['sha256']
        def derive(source,data,version):
            recipe,graph=a.music_loop_configuration(source['sha256'])
            output=b'ID3'+source['sha256'].encode()*30+str(recipe['sourceStartSeconds']).encode()
            digest=a.sha(output)
            return ({**source,'src':f'/music/clip-{digest}.mp3','sha256':digest,'bytes':len(output),'duration':72,
                     'provenance':'verified-local-derivative','source':source,
                     'processing':{'recipe':recipe,'filterGraph':graph}}, {'data':output,'duration':72})
        with patch.object(a,'REVIEWED_MUSIC_CROPS',{flower_sha:8,cactus_sha:10}), \
             patch.object(a,'REVIEWED_DYNAMIC_MUSIC_SOURCES',frozenset({ladybird_sha})), \
             patch.object(a,'derive_music_loop',side_effect=derive):
            a.activate(self.bundle,reviewed=True,loop_music=True)
        manifest=json.loads((self.root/'src/music-manifest.json').read_text())
        self.assertEqual(manifest['loopPreparation']['reviewedSourceCrops'],{
            flower_sha:{'sourceStartSeconds':8,'sourceEndSeconds':84},cactus_sha:{'sourceStartSeconds':10,'sourceEndSeconds':86}})
        self.assertEqual(manifest['loopPreparation']['reviewedSourceNormalizations'],{
            ladybird_sha:{'normalizationMode':'measured-dynamic','decodedLraMaximumLu':7.5}})
        self.assertEqual(manifest['lessons']['flower']['processing']['recipe']['sourceStartSeconds'],8)
        self.assertEqual(manifest['lessons']['cactus']['processing']['recipe']['sourceStartSeconds'],10)
        self.assertEqual(manifest['lessons']['ladybird']['processing']['recipe']['sourceStartSeconds'],4)
        self.assertEqual(manifest['lessons']['ladybird']['processing']['recipe']['normalizationMode'],'measured-dynamic')
        for bed in manifest['levels'].values():
            self.assertEqual(bed['processing']['recipe'],a.LOOP_RECIPE)
            self.assertEqual(bed['processing']['filterGraph'],a.LOOP_GRAPH)

    def test_loop_failure_leaves_the_previous_public_library_untouched(self):
        self.music_bundle()
        with patch.object(a,'derive_music_loop',side_effect=a.SafeError('injected local loop failure')):
            with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True,loop_music=True)
        self.assert_originals(); self.assertFalse(self.activation_records())

    def test_invalid_encoder_version_cannot_activate_or_modify_media(self):
        self.music_bundle()
        with patch.object(a.subprocess, 'check_output', return_value='unrecognised encoder'), \
             patch.object(a, 'derive_music_loop') as derive:
            with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True,loop_music=True)
            derive.assert_not_called()
        self.assert_originals(); self.assertFalse(self.activation_records())

    def test_multiple_overrides_and_all_three_fallbacks_activate_with_complete_loop_provenance(self):
        self.music_bundle(lessons=('sun','rainbow','balloon'))
        raw=json.loads((self.bundle/'music-manifest.json').read_text())
        def derive(source,data,version):
            expected=next((MUSIC+name.encode() for name,spec in self.music_registry.items() if spec['prompt']==source['prompt']),MUSIC)
            self.assertEqual(data, expected)
            data=b'ID3'+b'loop-'+source['sha256'].encode()*30
            digest=a.sha(data)
            return ({**source,'src':f'/music/clip-{digest}.mp3','sha256':digest,'bytes':len(data),'duration':72,
                     'provenance':'verified-local-derivative','source':source,'processing':{'recipe':a.LOOP_RECIPE}},
                    {'data':data,'duration':72})
        with patch.object(a,'derive_music_loop',side_effect=derive) as prepare:
            result=a.activate(self.bundle,reviewed=True,loop_music=True)
        self.assertEqual(prepare.call_count,6)
        self.assertEqual(set(result['musicLessons']),{'rainbow','sun','balloon'})
        manifest=json.loads((self.root/'src/music-manifest.json').read_text())
        index=json.loads((self.root/'src/music-index.json').read_text())
        overrides=json.loads((self.root/'src/lesson-music-index.json').read_text())
        self.assertEqual(set(index),set(a.LEVELS)); self.assertEqual(set(overrides),{'sun','rainbow','balloon'})
        for collection in ('levels','lessons'):
            for name,clip in manifest[collection].items():
                self.assertEqual(clip['source']['sha256'],raw[collection][name]['sha256'])
                self.assertEqual(clip['source']['generationSettings'],raw[collection][name]['generationSettings'])
                self.assertEqual(clip['source']['cacheKey'],raw[collection][name]['cacheKey'])
                self.assertEqual(clip['provenance'],'verified-local-derivative')
                self.assertEqual(a.sha((self.root/'public'/clip['src'].lstrip('/')).read_bytes()),clip['sha256'])
        self.assertEqual(len(set(overrides.values())),3,'Each subject keeps its own processed music asset')
        for name,source in overrides.items():
            self.assertEqual(source,manifest['lessons'][name]['src'])
            self.assertNotIn(source,index.values(),'A subject bed cannot be substituted by a level fallback')
        self.assertEqual(result['uniqueAssets'],5,'Speech, one deduplicated fallback and three distinct subject beds')

    def test_missing_extra_swapped_or_changed_subject_requests_are_rejected_before_activation(self):
        self.music_bundle(lessons=('sun','rainbow','balloon'))
        path=self.bundle/'music-manifest.json'; original=path.read_bytes()
        complete=json.loads(original)['lessons']
        missing={name:clip for name,clip in complete.items() if name!='balloon'}
        extra={**complete,'unknown':complete['sun']}
        swapped={**complete,'balloon':complete['sun'],'sun':complete['balloon']}
        for lessons in (missing,extra,swapped):
            manifest=json.loads(original); manifest['lessons']=lessons; path.write_bytes(a.json_bytes(manifest))
            with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
            self.assert_originals(); self.assertFalse(self.activation_records())
        path.write_bytes(original)
        self.music_registry['balloon']['prompt']='A different unreviewed subject.'
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.assert_originals(); self.assertFalse(self.activation_records())

    def test_unknown_balloon_provenance_cannot_replace_an_existing_subject_library(self):
        self.music_bundle(lessons=('sun','rainbow','balloon'))
        active=self.old_asset('music',b'previous complete music library')
        previous={'sun':'/music/'+active.name,'rainbow':'/music/'+active.name,'balloon':'/music/'+active.name}
        path=self.root/'src/lesson-music-index.json'
        path.write_bytes(a.json_bytes(previous))
        self.originals[path.relative_to(self.root).as_posix()]=path.read_bytes()
        manifest=json.loads((self.bundle/'music-manifest.json').read_text())
        identity=manifest['lessons']['balloon']['cacheKey']
        receipt_file=self.root/'media/elevenlabs/cache'/identity/'receipt.json'
        receipt=json.loads(receipt_file.read_text()); receipt['status']='pending-unknown'
        receipt_file.write_bytes(a.json_bytes(receipt))
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.assert_originals(); self.assertFalse(self.activation_records())
        self.assertEqual(active.read_bytes(),b'previous complete music library')

    def test_lesson_music_index_failure_rolls_back_all_other_metadata_and_assets(self):
        self.music_bundle(lessons=('sun',))
        original=a.atomic_write; failed=False
        target=self.root/'src/lesson-music-index.json'
        def failing(path,data,mode=0o644):
            nonlocal failed
            if path==target and not failed:
                failed=True; raise OSError('injected lesson index write failure')
            return original(path,data,mode)
        with patch.object(a,'atomic_write',side_effect=failing):
            with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.assert_originals(); self.assertFalse(target.exists())
        self.assertEqual(json.loads(self.activation_records()[0].read_text())['status'],'rolled-back')

    def test_metadata_write_failure_rolls_back_exact_bytes_and_removes_new_assets(self):
        original=a.atomic_write
        target=self.root/'src/narration-index.json'
        failed=False
        def failing(path,data,mode=0o644):
            nonlocal failed
            if path==target and not failed:
                failed=True
                raise OSError('injected write failure')
            return original(path,data,mode)
        with patch.object(a,'atomic_write',side_effect=failing):
            with self.assertRaises(a.SafeError) as result: a.activate(self.bundle,reviewed=True)
        self.assertIn('previous state was restored',str(result.exception))
        self.assert_originals()
        self.assertFalse((self.root/'public'/self.clips['sample']['src'].lstrip('/')).exists())
        self.assertEqual(json.loads(self.activation_records()[0].read_text())['status'],'rolled-back')

    def test_retirement_failure_restores_already_moved_audio_and_metadata(self):
        old2=self.old_asset('narration',b'old narration two')
        original=a.os.replace
        failed=False
        def failing(source,destination):
            nonlocal failed
            if Path(source)==old2 and not failed:
                failed=True
                raise OSError('injected retirement failure')
            return original(source,destination)
        with patch.object(a.os,'replace',side_effect=failing):
            with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.assert_originals()
        self.assertEqual(old2.read_bytes(),b'old narration two')
        self.assertFalse((self.root/'public'/self.clips['sample']['src'].lstrip('/')).exists())
        self.assertEqual(json.loads(self.activation_records()[0].read_text())['status'],'rolled-back')

    def test_existing_hash_named_asset_with_different_content_is_not_overwritten(self):
        destination=self.root/'public'/self.clips['sample']['src'].lstrip('/')
        destination.write_bytes(b'unexpected existing contents')
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.assertEqual(destination.read_bytes(),b'unexpected existing contents')
        self.assert_originals()

    def test_missing_probe_or_mutated_probe_duration_does_not_activate(self):
        with patch.object(a.shutil,'which',return_value=None):
            with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.probe.return_value=1.5
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.assert_originals()

    def test_duplicate_json_metadata_is_rejected(self):
        (self.bundle/'bundle.json').write_text('{"provider":"ElevenLabs","provider":"Other"}')
        with self.assertRaises(a.SafeError): a.activate(self.bundle,reviewed=True)
        self.assert_originals()

    def test_real_ffprobe_accepts_valid_mp3_and_rejects_disguised_wav(self):
        # The transaction tests above use fake audio and an injected probe. This
        # separate fixture exercises actual format/codec/rate/duration detection.
        ffmpeg=real_which('ffmpeg')
        ffprobe=real_which('ffprobe')
        if not ffmpeg or not ffprobe: self.skipTest('ffmpeg/ffprobe unavailable')
        source=self.root/'valid.mp3'
        subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1',
                        '-ar','44100','-ac','1','-codec:a','libmp3lame','-b:a','128k',str(source)],check=True)
        duration=real_probe(source,'narration')
        self.assertTrue(0<duration<2)
        wrong=self.root/'wave.mp3'
        subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1',
                        '-ar','44100','-ac','1','-f','wav',str(wrong)],check=True)
        with self.assertRaises(a.SafeError): real_probe(wrong,'narration')

class RealLoopTests(unittest.TestCase):
    def test_reviewed_source_crop_preserves_default_identity_and_all_comfort_guards(self):
        default_recipe=copy.deepcopy(a.LOOP_RECIPE); default_graph=a.LOOP_GRAPH
        unknown='0'*64
        recipe,graph=a.music_loop_configuration(unknown)
        self.assertEqual(recipe,default_recipe); self.assertEqual(graph,default_graph)
        old_spec={'schemaVersion':1,'sourceSha256':unknown,'recipe':default_recipe,'filterGraph':default_graph,'ffmpegVersion':'fixture'}
        selected_spec={**old_spec,'recipe':recipe,'filterGraph':graph}
        self.assertEqual(a.sha(a.canonical(old_spec)),a.sha(a.canonical(selected_spec)))
        recipe['sourceStartSeconds']=12
        self.assertEqual(a.LOOP_RECIPE,default_recipe,'A caller must not mutate the default recipe through its returned copy')
        flower='37a3fc86b68564eeed6584ebc51d015c1a61628570b1f6a80fddeeb763ff6411'
        selected,selected_graph=a.music_loop_configuration(flower)
        self.assertEqual(selected['sourceStartSeconds'],8); self.assertEqual(selected['sourceEndSeconds'],84)
        self.assertEqual({key:value for key,value in selected.items() if key not in ('sourceStartSeconds','sourceEndSeconds')},
                         {key:value for key,value in default_recipe.items() if key not in ('sourceStartSeconds','sourceEndSeconds')})
        self.assertTrue(selected_graph.startswith('[0:a]atrim=start=8:end=84,'))
        self.assertEqual(selected_graph.replace('atrim=start=8:end=84','atrim=start=4:end=80',1),default_graph)
        cactus='1917db0daa74bd560dcb2d934eefa5ba9194fce525bfd164a7e25e622e08b096'
        selected,selected_graph=a.music_loop_configuration(cactus)
        self.assertEqual(selected,{**default_recipe,'sourceStartSeconds':10,'sourceEndSeconds':86})
        self.assertEqual(selected_graph.replace('atrim=start=10:end=86','atrim=start=4:end=80',1),default_graph)
        ladybird='f9aa89a07a8c2b31106f72ebb97b3db418d4c77f616557ec8256faaf8a06c196'
        selected,selected_graph=a.music_loop_configuration(ladybird)
        self.assertEqual(selected,{**default_recipe,'normalizationMode':'measured-dynamic','decodedLraMaximumLu':7.5})
        self.assertEqual(selected_graph,default_graph)
        for digest in (flower,cactus,ladybird):
            changed=('0' if digest[0]!='0' else '1')+digest[1:]
            self.assertEqual(a.music_loop_configuration(changed),(default_recipe,default_graph),
                             'An unrecognised source cannot inherit a reviewed recipe')
        self.assertEqual(a.music_loop_configuration('0'+flower[1:]),(default_recipe,default_graph))
        for invalid in ('flower',flower[:63],None,[],'A'*64):
            with self.assertRaises(a.SafeError):a.music_loop_configuration(invalid)
        with patch.object(a,'REVIEWED_MUSIC_CROPS',{flower:15}):
            with self.assertRaises(a.SafeError):a.music_loop_configuration(flower)

    def test_dynamic_normalization_guards_and_receipts_bind_the_exact_source_mode(self):
        data=b'ID3'+b'offline source fixture'*200
        digest=a.sha(data)
        source={'src':f'/music/clip-{digest}.mp3','sha256':digest,'bytes':len(data),
                'duration':90.044,'encoding':a.ENCODING['music'],'prompt':'Ladybird',
                'generationSettings':{'music_length_ms':90000}}
        report={'input_i':'-20.00','input_tp':'-5.00','input_lra':'7.20','input_thresh':'-30.00',
                'target_offset':'0.00','output_i':'-20.00','output_tp':'-5.00','normalization_type':'dynamic'}
        def exercise(dynamic,mode='dynamic',lra='7.20',decoded_i='-20.00',decoded_tp='-5.00',render_i='-20.00',render_tp='-5.00',tamper=None):
            calls=[]
            def run(command,**kwargs):
                calls.append(command)
                if len(calls)%3==2:
                    Path(command[-1]).write_bytes(b'ID3'+b'bounded prepared fixture'*200)
                    value={**report,'normalization_type':mode,'output_i':render_i,'output_tp':render_tp}
                elif len(calls)%3==0:
                    value={**report,'input_lra':lra,'input_i':decoded_i,'input_tp':decoded_tp}
                else:value=report
                return subprocess.CompletedProcess(command,0,'',json.dumps(value))
            with tempfile.TemporaryDirectory() as temporary, patch.object(a,'ROOT',Path(temporary)), \
                 patch.object(a,'REVIEWED_DYNAMIC_MUSIC_SOURCES',frozenset({digest}) if dynamic else frozenset()), \
                 patch.object(a.subprocess,'run',side_effect=run), patch.object(a,'probe_mp3',return_value=72.0), \
                 patch.object(a,'loop_continuity',return_value={'joinDifferenceDb':0}):
                clip,_=a.derive_music_loop(source,data,'offline fixture encoder')
                recipe=clip['processing']['recipe']
                self.assertEqual(recipe['normalizationMode'],'measured-dynamic' if dynamic else 'measured-linear')
                self.assertIn(':linear=false:' if dynamic else ':linear=true:',calls[1][calls[1].index('-filter_complex')+1])
                folder=Path(temporary)/'media/elevenlabs/loops'/clip['processing']['processingKey']
                receipt_path=folder/'receipt.json'; receipt=a.read_json(receipt_path)
                self.assertEqual(receipt['specification']['recipe'],recipe)
                self.assertEqual(receipt['filterGraph'],clip['processing']['filterGraph'])
                self.assertEqual(receipt['loudnessResult']['normalization_type'],mode)
                self.assertEqual(receipt['specification']['sourceSha256'],digest)
                if tamper:
                    tamper(receipt)
                    receipt_path.write_bytes(a.json_bytes(receipt))
                    with self.assertRaisesRegex(a.SafeError,'cached loop differs'):
                        a.derive_music_loop(source,data,'offline fixture encoder')
        exercise(True)
        exercise(False,mode='linear')
        for kwargs in ({'mode':'linear'},{'lra':'7.51'},{'decoded_i':'-20.51'},
                       {'decoded_tp':'-1.99'},{'render_i':'-20.31'},{'render_tp':'-1.89'}):
            with self.subTest(kwargs=kwargs), self.assertRaises(a.SafeError):exercise(True,**kwargs)
        with self.assertRaises(a.SafeError):exercise(False,mode='dynamic')
        exercise(True,tamper=lambda receipt:receipt['specification']['recipe'].update(normalizationMode='measured-linear'))
        exercise(True,tamper=lambda receipt:receipt.update(filterGraph=receipt['filterGraph'].replace(':linear=false:',':linear=true:')))
        exercise(True,tamper=lambda receipt:receipt['loudnessResult'].update(normalization_type='linear'))

    def test_continuity_guard_rejects_a_seam_trough_even_when_the_join_itself_matches(self):
        import struct
        healthy=struct.pack('<hh',1000,-1000)*(72*16000//2)
        with patch.object(a.subprocess,'check_output',return_value=healthy):
            report=a.loop_continuity(Path('fixture.mp3'))
            self.assertEqual(report['joinDifferenceDb'],0)
        trough=bytearray(healthy)
        trough[68*16000*2:70*16000*2]=bytes(2*16000*2)
        with patch.object(a.subprocess,'check_output',return_value=bytes(trough)):
            with self.assertRaises(a.SafeError): a.loop_continuity(Path('fixture.mp3'))

    def test_real_loop_is_cyclic_decoded_bounded_and_rejects_self_consistent_cache_tampering(self):
        ffmpeg=real_which('ffmpeg')
        if not ffmpeg or not real_which('ffprobe'): self.skipTest('ffmpeg/ffprobe unavailable')
        import array, math
        with tempfile.TemporaryDirectory() as temporary, patch.object(a,'ROOT',Path(temporary)):
            root=Path(temporary)
            source_file=root/'source.mp3'
            subprocess.run([ffmpeg,'-nostdin','-v','error','-f','lavfi','-i','sine=frequency=440:duration=90',
                '-af','volume=0.4,afade=t=out:st=80:d=10','-ar','44100','-ac','2',
                '-codec:a','libmp3lame','-b:a','128k',str(source_file)],check=True)
            data=source_file.read_bytes(); digest=a.sha(data)
            source={'src':f'/music/clip-{digest}.mp3','sha256':digest,'bytes':len(data),
                'duration':real_probe(source_file,'music'),'provider':'ElevenLabs','provenance':'verified-api-response',
                'model':'music_v2_5','cacheKey':a.sha(b'fixture generation request'),'encoding':a.ENCODING['music'],
                'generationSettings':{'model_id':'music_v2_5','music_length_ms':90000,'force_instrumental':True,'prompt':'Fixture music.'}}
            version=subprocess.check_output([ffmpeg,'-version'],text=True).splitlines()[0]
            clip,asset=a.derive_music_loop(source,data,version)
            self.assertEqual(clip['provenance'],'verified-local-derivative')
            self.assertEqual(clip['source'],source)
            self.assertEqual(clip['src'],f'/music/clip-{a.sha(asset["data"])}.mp3')
            self.assertTrue(71.9<clip['duration']<72.2)
            self.assertLessEqual(float(clip['processing']['decodedVerification']['input_tp']),-2)
            self.assertLessEqual(abs(float(clip['processing']['decodedVerification']['input_i'])+20),.5)
            self.assertEqual(source_file.read_bytes(),data,'The generated source is immutable')
            folder=root/'media/elevenlabs/loops'/clip['processing']['processingKey']
            receipt_file=folder/'receipt.json'; loop_file=folder/'loop.mp3'
            receipt=a.read_json(receipt_file)
            self.assertEqual(a.sha(receipt_file.read_bytes()),clip['processing']['receiptSha256'])
            samples=array.array('h',subprocess.check_output([ffmpeg,'-nostdin','-v','error','-i',str(loop_file),
                '-ar','16000','-ac','1','-f','s16le','-']))
            def level(start,end):
                part=samples[int(start*16000):int(end*16000)]
                return 20*math.log10(math.sqrt(sum(x*x for x in part)/len(part))/32768)
            self.assertLess(abs(level(0,.25)-level(71.75,72)),3,
                            'The output boundary joins adjacent source positions, not a fade-to-silence ending')
            self.assertGreater(level(70,72),level(8,10)-6)
            first,first_asset=a.derive_music_loop(source,data,version)
            self.assertEqual(first,clip); self.assertEqual(first_asset['data'],asset['data'])
            with patch.object(a,'REVIEWED_MUSIC_CROPS',{digest:8}):
                alternate,alternate_asset=a.derive_music_loop(source,data,version)
            self.assertEqual(alternate['processing']['recipe']['sourceStartSeconds'],8)
            self.assertEqual(alternate['processing']['recipe']['sourceEndSeconds'],84)
            self.assertNotEqual(alternate['processing']['processingKey'],clip['processing']['processingKey'])
            self.assertTrue(71.9<alternate['duration']<72.2)
            alternate_receipt=a.read_json(root/'media/elevenlabs/loops'/alternate['processing']['processingKey']/'receipt.json')
            self.assertEqual(alternate_receipt['specification']['recipe'],alternate['processing']['recipe'])
            self.assertTrue(alternate_receipt['specification']['filterGraph'].startswith('[0:a]atrim=start=8:end=84,'))
            self.assertEqual(alternate_receipt['sourceRecordSha256'],a.sha(a.canonical(source)))
            self.assertEqual(alternate_receipt['sha256'],a.sha(alternate_asset['data']))
            self.assertEqual(source_file.read_bytes(),data)
            changed=bytearray(loop_file.read_bytes()); changed[len(changed)//2]^=1
            loop_file.write_bytes(changed)
            receipt['sha256']=a.sha(changed); receipt['bytes']=len(changed)
            receipt_file.write_bytes(a.json_bytes(receipt))
            with self.assertRaises(a.SafeError): a.derive_music_loop(source,data,version)
            self.assertEqual(source_file.read_bytes(),data)

class RealCatalogueTests(unittest.TestCase):
    def test_current_full_catalogue_and_sample_match_generator_without_credentials_or_api(self):
        texts=a.catalogue_texts()
        self.assertGreater(len(texts),1000)
        self.assertTrue(texts['sample'].startswith('Hello, little artist.'))
        self.assertTrue(all(name=='sample' or name.endswith(('/instruction','/hint')) for name in texts))

unittest.main(argv=['offline-activation-tests'],verbosity=2)
`;

test("ElevenLabs activation validates full reviewed bundles and rolls back local file failures", () => {
  const result = spawnSync("python3", ["-B", "-c", program], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
