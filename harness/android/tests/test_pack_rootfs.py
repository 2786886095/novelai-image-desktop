import importlib.util
import tempfile
import unittest
import zipfile
import json
from pathlib import Path
spec=importlib.util.spec_from_file_location('pack',Path(__file__).parents[1]/'pack_rootfs.py')
pack=importlib.util.module_from_spec(spec);spec.loader.exec_module(pack)
class RootfsTest(unittest.TestCase):
    def test_absolute_guest_links_are_relative_to_guest_root(self):
        self.assertEqual(pack.normalized_link('bin','/usr/bin'),'usr/bin')
        self.assertEqual(pack.normalized_link('usr/bin/node','../local/bin/node'),'usr/local/bin/node')
        with self.assertRaises(ValueError):pack.normalized_link('x','../../etc')
    def test_archive_contains_no_developer_home(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'root';root.mkdir();(root/'usr').mkdir();(root/'usr/fixture').write_text('runtime-only')
            lock=json.loads((Path(__file__).parents[1]/'runtime-lock.json').read_text())
            output=Path(directory)/'agent-rootfs.zip';pack.pack(root,output,lock)
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(set(archive.namelist()),{'usr/','usr/fixture','.studio-rootfs.json'})
            self.assertEqual(json.loads(output.with_name('seed.json').read_text())['bytes'],output.stat().st_size)
if __name__=='__main__':unittest.main()
