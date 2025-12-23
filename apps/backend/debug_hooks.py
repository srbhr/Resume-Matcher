from PyInstaller.utils.hooks import collect_all
import pprint
import sys

# Make sure we can import magika to check if it's installed
try:
    import magika
    print(f"Magika found at: {magika.__file__}")
except ImportError:
    print("Magika not found!")

print("Collecting all for magika...")
try:
    ret = collect_all('magika')
    print("Datas:")
    pprint.pprint(ret[0])
    print("Binaries:")
    pprint.pprint(ret[1])
    print("Hidden Imports:")
    pprint.pprint(ret[2])
except Exception as e:
    print(f"Error collecting: {e}")
