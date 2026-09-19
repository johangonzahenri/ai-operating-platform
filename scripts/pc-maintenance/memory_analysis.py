import ctypes
from ctypes import wintypes
import os

psapi = ctypes.WinDLL('psapi.dll')
kernel32 = ctypes.WinDLL('kernel32.dll')

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

class MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ('dwLength', wintypes.DWORD),
        ('dwMemoryLoad', wintypes.DWORD),
        ('ullTotalPhys', ctypes.c_uint64),
        ('ullAvailPhys', ctypes.c_uint64),
        ('ullTotalPageFile', ctypes.c_uint64),
        ('ullAvailPageFile', ctypes.c_uint64),
        ('ullTotalVirtual', ctypes.c_uint64),
        ('ullAvailVirtual', ctypes.c_uint64),
        ('ullAvailExtendedVirtual', ctypes.c_uint64),
    ]

stat = MEMORYSTATUSEX()
stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))

max_pids = 4096
pids_array = (wintypes.DWORD * max_pids)()
bytes_returned = wintypes.DWORD()
psapi.EnumProcesses(pids_array, ctypes.sizeof(pids_array), ctypes.byref(bytes_returned))
num_pids = bytes_returned.value // ctypes.sizeof(wintypes.DWORD)

proc_map = {}
total_ws = 0
total_commit = 0

for i in range(num_pids):
    pid = pids_array[i]
    if pid <= 4:
        continue
    h_proc = kernel32.OpenProcess(0x1000 | 0x0400, False, pid)
    if not h_proc:
        continue
    
    buf = ctypes.create_string_buffer(512)
    name = "unknown"
    if psapi.GetProcessImageFileNameA(h_proc, buf, 512) > 0:
        raw = buf.value.decode('latin-1', errors='ignore')
        name = os.path.basename(raw.replace('/', '\\'))
    
    pmc = PROCESS_MEMORY_COUNTERS()
    pmc.cb = ctypes.sizeof(PROCESS_MEMORY_COUNTERS)
    if psapi.GetProcessMemoryInfo(h_proc, ctypes.byref(pmc), pmc.cb):
        ws_mb = pmc.WorkingSetSize / (1024 * 1024)
        commit_mb = pmc.PagefileUsage / (1024 * 1024)
        total_ws += ws_mb
        total_commit += commit_mb
        if name not in proc_map:
            proc_map[name] = {'count': 0, 'ws': 0, 'commit': 0}
        proc_map[name]['count'] += 1
        proc_map[name]['ws'] += ws_mb
        proc_map[name]['commit'] += commit_mb
    kernel32.CloseHandle(h_proc)

print(f"===========================================================")
print(f"ESTADO GENERAL DE MEMORIA FÍSICA (RAM)")
print(f"===========================================================")
print(f"Uso de RAM Reportado por Windows : {stat.dwMemoryLoad}%")
print(f"Memoria RAM Total Instalada      : {stat.ullTotalPhys / (1024**3):.2f} GB")
print(f"Memoria RAM Disponible           : {stat.ullAvailPhys / (1024**3):.2f} GB ({stat.ullAvailPhys / (1024**2):.0f} MB)")
print(f"Suma WorkingSet de Aplicaciones  : {total_ws / 1024:.2f} GB")
print(f"Suma Memoria Reservada (Commit)  : {total_commit / 1024:.2f} GB")
print(f"===========================================================\n")

sorted_by_commit = sorted(proc_map.items(), key=lambda x: x[1]['commit'], reverse=True)
print(f"{'APLICACIÓN / PROCESO':<30} {'INSTANCIAS':<12} {'RAM ACTIVA (WS)':<18} {'MEMORIA RETENIDA (COMMIT)':<25}")
print("-" * 85)
for name, data in sorted_by_commit[:15]:
    print(f"{name:<30} {data['count']:<12} {data['ws']:<18.1f} {data['commit']:<25.1f}")
