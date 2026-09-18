#!/usr/bin/env pythonw
# -*- coding: utf-8 -*-
"""
windows-ram-sentinel (win-memory-daemon)
=========================================
Ultra-lightweight background memory sentinel for Windows.
Monitors memory pressure using Win32 API and automatically trims working sets
when physical memory load exceeds the configured threshold, while skipping
critical gaming processes and graphics drivers to eliminate stuttering.

Zero external dependencies: Python standard library (ctypes, ctypes.wintypes, time).
"""

import ctypes
from ctypes import wintypes
import time
import os
import sys

# ==========================================
# CONFIGURATION CONSTANTS
# ==========================================
RAM_THRESHOLD_PERCENT = 75.0    # Memory load threshold to trigger purge (>= 75%)
CHECK_INTERVAL_SECONDS = 5.0    # Memory polling interval in seconds
COOLDOWN_SECONDS = 15.0         # Cooldown period after a purge to prevent thrashing

# Exclusion list: Game engines, anti-cheat, graphics drivers,
# and core Windows kernel components to avoid stuttering/frame drops.
EXCLUDED_PROCESSES = {
    # Active Game Engines (Preserve memory to avoid in-game stutter)
    "cs2.exe",
    "dota2.exe",
    "valorant.exe",
    "league of legends.exe",
    "gta5.exe",
    "gtav.exe",
    "playgtav.exe",
    "fortniteclient-win64-shipping.exe",
    "genshinimpact.exe",
    "javaw.exe",
    "minecraft.exe",
    "cod.exe",
    "r5apex.exe",
    "overwatch.exe",
    
    # Anti-cheat & Drivers
    "vgtray.exe",
    "easyanticheat.exe",
    "easyanticheat_eos.exe",
    
    # GPU / Hardware Core Drivers
    "nvcontainer.exe",
    "nvdisplay.container.exe",
    "nvidia share.exe",
    "amdrsserv.exe",
    "radeonsoftware.exe",
    
    # Windows Core Kernel / Session
    "system",
    "registry",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "lsass.exe",
    "dwm.exe",
}

# ==========================================
# WIN32 API STRUCTURES & DEFINITIONS
# ==========================================

PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
PROCESS_SET_QUOTA = 0x0100

kernel32 = ctypes.WinDLL('kernel32.dll', use_last_error=True)
psapi = ctypes.WinDLL('psapi.dll', use_last_error=True)
advapi32 = ctypes.WinDLL('advapi32.dll', use_last_error=True)

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

GlobalMemoryStatusEx = kernel32.GlobalMemoryStatusEx
GlobalMemoryStatusEx.argtypes = [ctypes.POINTER(MEMORYSTATUSEX)]
GlobalMemoryStatusEx.restype = wintypes.BOOL

EnumProcesses = psapi.EnumProcesses
EnumProcesses.argtypes = [
    ctypes.POINTER(wintypes.DWORD),
    wintypes.DWORD,
    ctypes.POINTER(wintypes.DWORD)
]
EnumProcesses.restype = wintypes.BOOL

OpenProcess = kernel32.OpenProcess
OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
OpenProcess.restype = wintypes.HANDLE

CloseHandle = kernel32.CloseHandle
CloseHandle.argtypes = [wintypes.HANDLE]
CloseHandle.restype = wintypes.BOOL

GetProcessImageFileNameA = psapi.GetProcessImageFileNameA
GetProcessImageFileNameA.argtypes = [
    wintypes.HANDLE,
    ctypes.c_char_p,
    wintypes.DWORD
]
GetProcessImageFileNameA.restype = wintypes.DWORD

EmptyWorkingSet = psapi.EmptyWorkingSet
EmptyWorkingSet.argtypes = [wintypes.HANDLE]
EmptyWorkingSet.restype = wintypes.BOOL


# ==========================================
# PRIVILEGE ESCALATION (SE_DEBUG_PRIVILEGE)
# ==========================================

def enable_debug_privilege():
    """Attempts to enable SeDebugPrivilege on the current process token."""
    SE_PRIVILEGE_ENABLED = 0x00000002
    TOKEN_ADJUST_PRIVILEGES = 0x0020
    TOKEN_QUERY = 0x0008

    class LUID(ctypes.Structure):
        _fields_ = [("LowPart", wintypes.DWORD), ("HighPart", wintypes.LONG)]

    class LUID_AND_ATTRIBUTES(ctypes.Structure):
        _fields_ = [("Luid", LUID), ("Attributes", wintypes.DWORD)]

    class TOKEN_PRIVILEGES(ctypes.Structure):
        _fields_ = [("PrivilegeCount", wintypes.DWORD), ("Privileges", LUID_AND_ATTRIBUTES * 1)]

    h_token = wintypes.HANDLE()
    h_current_proc = kernel32.GetCurrentProcess()

    if advapi32.OpenProcessToken(h_current_proc, TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, ctypes.byref(h_token)):
        luid = LUID()
        if advapi32.LookupPrivilegeValueW(None, "SeDebugPrivilege", ctypes.byref(luid)):
            tp = TOKEN_PRIVILEGES()
            tp.PrivilegeCount = 1
            tp.Privileges[0].Luid = luid
            tp.Privileges[0].Attributes = SE_PRIVILEGE_ENABLED
            advapi32.AdjustTokenPrivileges(h_token, False, ctypes.byref(tp), 0, None, None)
        kernel32.CloseHandle(h_token)


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def get_memory_info():
    """Queries current Windows physical memory stats."""
    stat = MEMORYSTATUSEX()
    stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    if GlobalMemoryStatusEx(ctypes.byref(stat)):
        return {
            'load': float(stat.dwMemoryLoad),
            'total_gb': stat.ullTotalPhys / (1024 ** 3),
            'avail_gb': stat.ullAvailPhys / (1024 ** 3),
            'avail_mb': stat.ullAvailPhys / (1024 ** 2),
            'total_mb': stat.ullTotalPhys / (1024 ** 2),
        }
    return {'load': 0.0, 'total_gb': 0.0, 'avail_gb': 0.0, 'avail_mb': 0.0, 'total_mb': 0.0}


def get_process_image_name(h_process: wintypes.HANDLE) -> str:
    """Extracts normalized executable filename from open process handle."""
    buf_size = 512
    buffer = ctypes.create_string_buffer(buf_size)
    result = GetProcessImageFileNameA(h_process, buffer, buf_size)
    if result > 0:
        raw_path = buffer.value.decode('latin-1', errors='ignore')
        return os.path.basename(raw_path.replace('/', '\\')).lower().strip()
    return ""


def purge_working_sets():
    """
    Enumerates running processes and trims working sets for non-excluded processes.
    Reclaims unused physical memory safely into the OS free pool.
    """
    max_pids = 4096
    pids_array = (wintypes.DWORD * max_pids)()
    bytes_returned = wintypes.DWORD()

    if not EnumProcesses(pids_array, ctypes.sizeof(pids_array), ctypes.byref(bytes_returned)):
        return 0

    num_processes = bytes_returned.value // ctypes.sizeof(wintypes.DWORD)
    current_pid = os.getpid()
    trimmed_count = 0

    for i in range(num_processes):
        pid = pids_array[i]
        if pid <= 4 or pid == current_pid:
            continue

        # Try opening with PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION
        desired_access = PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_QUOTA
        h_process = OpenProcess(desired_access, False, pid)
        if not h_process:
            desired_access = PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA
            h_process = OpenProcess(desired_access, False, pid)

        if not h_process:
            continue

        try:
            image_name = get_process_image_name(h_process)
            if image_name and image_name in EXCLUDED_PROCESSES:
                continue

            if EmptyWorkingSet(h_process):
                trimmed_count += 1
        except Exception:
            pass
        finally:
            CloseHandle(h_process)

    return trimmed_count


# ==========================================
# MAIN ROUTINES
# ==========================================

def run_once():
    """Runs a single on-demand memory purge and prints metrics."""
    enable_debug_privilege()
    before = get_memory_info()
    trimmed = purge_working_sets()
    time.sleep(0.5)
    after = get_memory_info()

    freed_mb = after['avail_mb'] - before['avail_mb']
    if freed_mb < 0:
        freed_mb = 0

    print(f"[+] Procesos optimizados : {trimmed}")
    print(f"[+] Uso de RAM inicial  : {before['load']:.1f}% ({before['avail_gb']:.2f} GB libres de {before['total_gb']:.2f} GB)")
    print(f"[+] Uso de RAM final    : {after['load']:.1f}% ({after['avail_gb']:.2f} GB libres de {after['total_gb']:.2f} GB)")
    print(f"[+] Memoria recuperada  : {freed_mb:.1f} MB (~{freed_mb / 1024:.2f} GB)")


def run_sentinel(threshold=RAM_THRESHOLD_PERCENT):
    """Continuous background monitoring daemon."""
    enable_debug_privilege()
    while True:
        try:
            info = get_memory_info()
            if info['load'] >= threshold:
                purge_working_sets()
                time.sleep(COOLDOWN_SECONDS)
            else:
                time.sleep(CHECK_INTERVAL_SECONDS)
        except Exception:
            time.sleep(CHECK_INTERVAL_SECONDS)


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--once' in args:
        run_once()
    else:
        # Check custom threshold if specified
        custom_threshold = RAM_THRESHOLD_PERCENT
        if '--threshold' in args:
            try:
                idx = args.index('--threshold')
                custom_threshold = float(args[idx + 1])
            except Exception:
                pass
        run_sentinel(threshold=custom_threshold)
