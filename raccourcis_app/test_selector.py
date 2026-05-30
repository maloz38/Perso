import subprocess
import json
import sys
import time

# Test without actions first
print("=== TEST 1: Without actions ===")
args1 = ['python', 'selector_picker.py', 'https://example.com', '[]']
print(f"Running: {args1}")

process1 = subprocess.Popen(
    args1,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

try:
    stdout, stderr = process1.communicate(timeout=15)
    print("STDOUT:", stdout)
    relevant = [l for l in stderr.split('\n') if '[SelectorPicker]' in l]
    print("STDERR (relevant):", '\n'.join(relevant))
    print("Return code:", process1.returncode)
except subprocess.TimeoutExpired:
    process1.kill()
    stdout, stderr = process1.communicate()
    print("TIMEOUT after 15s")
    relevant = [l for l in stderr.split('\n') if '[SelectorPicker]' in l]
    print("STDERR (relevant):", '\n'.join(relevant))

print("\n=== TEST 2: With one click action ===")
actions = [{"type":"click","selector":"h1"}]
args2 = ['python', 'selector_picker.py', 'https://example.com', json.dumps(actions)]
print(f"Running with actions: {actions}")

process2 = subprocess.Popen(
    args2,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True
)

try:
    stdout, stderr = process2.communicate(timeout=15)
    print("STDOUT:", stdout)
    relevant = [l for l in stderr.split('\n') if '[SelectorPicker]' in l]
    print("STDERR (relevant):", '\n'.join(relevant))
    print("Return code:", process2.returncode)
except subprocess.TimeoutExpired:
    process2.kill()
    stdout, stderr = process2.communicate()
    print("TIMEOUT after 15s")
    relevant = [l for l in stderr.split('\n') if '[SelectorPicker]' in l]
    print("STDERR (relevant):", '\n'.join(relevant))
