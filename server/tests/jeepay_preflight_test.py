import unittest,tempfile,json,os,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('preflight',Path(__file__).resolve().parents[1]/'scripts/jeepay-preflight.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class PreflightTests(unittest.TestCase):
    def candidate(self,root):
        image='runtime@sha256:'+'a'*64
        services={n:{'image':image,'healthcheck':{'test':['CMD','true']}} for n in ['payment','mysql','redis','mq','namesrv']}
        (root/'compose.json').write_text(json.dumps({'services':services}));(root/'SOURCE_MANIFEST.json').write_text('{}');(root/'private').mkdir()
        for role in ['payment','merchant','manager']:
            p=root/'private'/f'{role}.yml';p.write_text(json.dumps({'secret':'do-not-echo-this-value'}));p.chmod(0o600)
        return services
    def test_missing(self):
        with tempfile.TemporaryDirectory() as d:
            r=m.inspect_candidate(d);self.assertFalse(r['productionReady']);self.assertIn('required_services',r['blockingReasons'])
    def test_static_pass_is_never_live_acceptance(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);self.candidate(root);r=m.inspect_candidate(root);self.assertTrue(all(c['ok'] for c in r['checks']));self.assertFalse(r['livePaymentsVerified']);self.assertFalse(r['activationChanged']);self.assertNotIn('do-not-echo',json.dumps(r))
    def test_public_ports_and_unpinned_images(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);s=self.candidate(root);s['mysql']['ports']=['3306:3306'];s['payment']['image']='runtime:latest';(root/'compose.json').write_text(json.dumps({'services':s}));r=m.inspect_candidate(root);self.assertIn('private_ports',r['blockingReasons']);self.assertIn('pinned_images',r['blockingReasons'])
    def test_loopback_binding_and_missing_health(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);s=self.candidate(root);s['payment']['ports']=[{'host_ip':'127.0.0.1','published':'9216','target':9216}];del s['redis']['healthcheck'];(root/'compose.json').write_text(json.dumps({'services':s}));r=m.inspect_candidate(root);self.assertNotIn('private_ports',r['blockingReasons']);self.assertIn('dependency_health',r['blockingReasons'])
    def test_bad_private_json_is_redacted(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);self.candidate(root);(root/'private/payment.yml').write_text('private-broken-marker');r=m.inspect_candidate(root);self.assertIn('payment_configuration',r['blockingReasons']);self.assertNotIn('private-broken-marker',json.dumps(r))
    def test_invalid_service_shapes_fail_closed(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);self.candidate(root)
            for services in [[],{'payment':'private-marker'}]:
                (root/'compose.json').write_text(json.dumps({'services':services}));r=m.inspect_candidate(root);self.assertIn('required_services',r['blockingReasons']);self.assertNotIn('private-marker',json.dumps(r))
    def test_merged_overlay_and_invalid_health(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);services=self.candidate(root);merged=root/'merged.json';merged.write_text(json.dumps({'services':services}));self.assertNotIn('dependency_health',m.inspect_candidate(root,merged)['blockingReasons'])
            services['redis']['healthcheck']='invalid';merged.write_text(json.dumps({'services':services}));self.assertIn('dependency_health',m.inspect_candidate(root,merged)['blockingReasons'])
if __name__=='__main__':unittest.main()
