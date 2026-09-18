import ctypes
from ctypes import wintypes
import os

psapi = ctypes.WinDLL('psapi.dll')
kernel32 = ctypes.WinDLL('kernel32.dll')

PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_VM_READ = 0x0010

class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
    _fields_ = [
        ('cb', wintypes.DWORD),
        ('PageFaultCount', wintypes.DWORD),
        ('PeakWorkingSetSize', ctypes.c_size_t),
        ('WorkingSetSize', ctypes.c_size_t),
        ('QuotaPeakPagedPoolUsage', ctypes.c_size_t),
        ('QuotaPagedPoolUsage', ctypes.c_size_t),
        ('QuotaPeakNonPagedPoolUsage', ctypes.c_size_t),
        ('QuotaNonPagedPoolUsage', ctypes.c_size_t),
        ('PagefileUsage', ctypes.c_size_t),
        ('PeakPagefileUsage', ctypes.c_size_t),
    ]

max_pids = 4096
pids_array = (wintypes.DWORD * max_pids)()
bytes_returned = wintypes.DWORD()

psapi.EnumProcesses(pids_array, ctypes.sizeof(pids_array), ctypes.byref(bytes_returned))
num_pids = bytes_returned.value // ctypes.sizeof(wintypes.DWORD)

proc_list = []
for i in range(num_pids):
    pid = pids_array[i]
    if pid <= 4:
        continue
    h_proc = kernel32.OpenProcess(0x1000 | 0x0400, False, pid) # QUERY_LIMITED_INFORMATION | QUERY_INFORMATION
    if not h_proc:
        continue
    
    # Get Name
    buf = ctypes.create_string_buffer(512)
    name = ""
    if psapi.GetProcessImageFileNameA(h_proc, buf, 512) > 0:
        raw = buf.value.decode('latin-1', errors='ignore')
        name = os.path.basename(raw.replace('/', '\\'))
    
    # Get Memory
    pmc = PROCESS_MEMORY_COUNTERS()
    pmc.cb = ctypes.sizeof(PROCESS_MEMORY_COUNTERS)
    ws_mb = 0
    pf_mb = 0
    if psapi.GetProcessMemoryInfo(h_proc, ctypes.byref(pmc), pmc.cb):
        ws_mb = pmc.WorkingSetSize / (1024 * 1024)
        pf_mb = pmc.PagefileUsage / (1024 * 1024)
    
    kernel32.CloseHandle(h_proc)
    if name:
        proc_list.append((name, pid, ws_mb, pf_mb))

# Group by name
grouped = {}
for name, pid, ws, pf in proc_list:
    if name not in grouped:
        grouped[name] = {'count': 0, 'ws_mb': 0, 'pf_mb': 0, 'pids': []}
    grouped[name]['count'] += 1
    grouped[name]['ws_mb'] += ws
    grouped[name]['pf_mb'] += pf
    grouped[name]['pids'].append(pid)

sorted_procs = sorted(grouped.items(), key=lambda x: x[1]['ws_mb'], reverse=True)

print(f"{'PROCESO':<30} {'INSTANCIAS':<12} {'RAM TOTAL (MB)':<18} {'COMMIT (MB)':<18}")
print("-" * 80)
for name, info in sorted_procs[:20]:
    print(f"{name:<30} {info['count']:<12} {info['ws_mb']:<18.1f} {info['pf_mb']:<18.1f}")
