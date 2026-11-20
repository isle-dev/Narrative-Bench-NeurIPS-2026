import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('open_eval_export', Path(__file__).parents[1] / 'open_eval.py')
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)


class OpenEvalTests(unittest.TestCase):
    def test_unspecified_sampling_settings_are_not_invented(self):
        row = {'model_id': 'm', 'response': 'Answer', 'response_sha256': export.text_sha('Answer'),
               'score': .5, 'language_status': 'unknown'}
        case = {'task': 'NI', 'system_instruction': 'Use evidence'}
        configuration = {'api_model': 'gemini-4-argon', 'generation': {'max_output_tokens':32768, 'thinking_level':'LOW'}}
        with patch.object(export, 'score', return_value=.5), patch.object(export, 'messages', return_value=[{'role':'system'}, {'role':'user','content':'Question'}]):
            result = export.response_entry(case, {}, row, configuration)
        settings = result['model']['model_adaptation']['generation_parameters']
        self.assertIsNone(settings['temperature'])
        self.assertIsNone(settings['do_sample'])
        self.assertIsNone(settings['top_p'])
        self.assertEqual(settings['thinking_level'], 'LOW')
        self.assertEqual(result['scores'][0]['value'], .5)
        self.assertEqual(result['item_adaptation']['request_input'], [{'role':'user','content':'Question'}])

    def test_changed_response_text_is_rejected(self):
        row = {'model_id': 'm', 'response': 'Changed', 'response_sha256': export.text_sha('Original'), 'score':.5}
        with self.assertRaisesRegex(ValueError, 'checksum'):
            export.response_entry({}, {}, row, {})

    def test_non_finite_or_out_of_range_scores_are_rejected(self):
        for value in (float('nan'), float('inf'), -0.1, 1.1):
            with self.subTest(value=value), self.assertRaises(ValueError):
                export.response_entry({}, {}, {'score':value}, {})
