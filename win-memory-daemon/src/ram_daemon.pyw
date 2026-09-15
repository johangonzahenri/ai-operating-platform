#!/usr/bin/env pythonw
# -*- coding: utf-8 -*-
"""
windows-ram-sentinel (win-memory-daemon)
=========================================
Ultra-lightweight background memory sentinel for Windows.
Monitors memory pressure using Win32 API and automatically trims working sets
when physical memory load exceeds the configured threshold, while skipping
critical gaming and productivity processes to eliminate stuttering.

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
RAM_THRESHOLD_PERCENT = 70.0    # Memory load threshold to trigger purge (>= 70%)
CHECK_INTERVAL_SECONDS = 5.0    # Memory polling interval in seconds
COOLDOWN_SECONDS = 15.0         # Cooldown period after a purge to prevent thrashing

# Exclusion list: Game executables, launchers, anti-cheat, graphics runtimes,
# and performance-sensitive background tasks to avoid stuttering/frame drops.
EXCLUDED_PROCESSES = {
    # Steam & Valve
    "steam.exe",
    "steamservice.exe",
    "steamwebhelper.exe",
    "cs2.exe",
    "dota2.exe",
    
    # Epic Games
    "epicgameslauncher.exe",
    "unrealceflibserver.exe",
    
    # Riot Games & Vanguard
    "riotclientservices.exe",
    "riotclientux.exe",
    "valorant.exe",
    "leagueclient.exe",
    "leagueclientux.exe",
    "league of legends.exe",
    "vgtray.exe",
    
    # EA & Ubisoft & Battle.net
    "eadesktop.exe",
    "eaorigin.exe",
    "eabackgroundservice.exe",
    "upc.exe",
    "ubisoftconnect.exe",
    "battle.net.exe",
    "agent.exe",
    
    # Popular Games
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
    
    # GPU / Hardware Overlays & Drivers
    "nvcontainer.exe",
    "nvdisplay.container.exe",
    "nvidia share.exe",
    "amdrsserv.exe",
    "radeonsoftware.exe",
    "obs64.exe",
    "obs32.exe",
    "discord.exe",
    
    # System / Core Windows
    "system",
    "registry",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "lsass.exe",
    "dwm.exe",
    "svchost.exe",
    "explorer.exe",
    "taskmgr.exe"
}

# ==========================================
# WIN32 API STRUCTURES & DEFINITIONS
# ==========================================

# PROCESS ACCESS RIGHTS
PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
PROCESS_SET_QUOTA = 0x0100

# Load kernel32 and psapi dlls
kernel32 = ctypes.WinDLL('kernel32.dll', use_last_error=True)
psapi = ctypes.WinDLL('psapi.dll', use_last_error=True)

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

# Setup GlobalMemoryStatusEx signature
GlobalMemoryStatusEx = kernel32.GlobalMemoryStatusEx
GlobalMemoryStatusEx.argtypes = [ctypes.POINTER(MEMORYSTATUSEX)]
GlobalMemoryStatusEx.restype = wintypes.BOOL

# Setup EnumProcesses signature
EnumProcesses = psapi.EnumProcesses
EnumProcesses.argtypes = [
    ctypes.POINTER(wintypes.DWORD),
    wintypes.DWORD,
    ctypes.POINTER(wintypes.DWORD)
]
EnumProcesses.restype = wintypes.BOOL

# Setup OpenProcess signature
OpenProcess = kernel32.OpenProcess
OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
OpenProcess.restype = wintypes.HANDLE

# Setup CloseHandle signature
CloseHandle = kernel32.CloseHandle
CloseHandle.argtypes = [wintypes.HANDLE]
CloseHandle.restype = wintypes.BOOL

# Setup GetProcessImageFileNameA signature
GetProcessImageFileNameA = psapi.GetProcessImageFileNameA
GetProcessImageFileNameA.argtypes = [
    wintypes.HANDLE,
    ctypes.c_char_p,
    wintypes.DWORD
]
GetProcessImageFileNameA.restype = wintypes.DWORD

# Setup EmptyWorkingSet signature
EmptyWorkingSet = psapi.EmptyWorkingSet
EmptyWorkingSet.argtypes = [wintypes.HANDLE]
EmptyWorkingSet.restype = wintypes.BOOL


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def get_memory_load_percentage() -> float:
    """Queries current Windows physical memory load percentage."""
    stat = MEMORYSTATUSEX()
    stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    if GlobalMemoryStatusEx(ctypes.byref(stat)):
        return float(stat.dwMemoryLoad)
    return 0.0


def get_process_image_name(h_process: wintypes.HANDLE) -> str:
    """
    Extracts the executable filename from an open process handle.
    Returns normalized lowercase basename (e.g. 'steam.exe') or empty string on failure.
    """
    buf_size = 512
    buffer = ctypes.create_string_buffer(buf_size)
    result = GetProcessImageFileNameA(h_process, buffer, buf_size)
    if result > 0:
        raw_path = buffer.value.decode('latin-1', errors='ignore')
        # Extract binary name from device path (/Device/HarddiskVolumeX/.../app.exe or \...\app.exe)
        normalized_name = os.path.basename(raw_path.replace('/', '\\')).lower().strip()
        return normalized_name
    return ""


def purge_working_sets():
    """
    Enumerates running processes and trims working sets for eligible non-excluded processes.
    Protects critical system processes and games against stuttering.
    """
    max_pids = 4096
    pids_array = (wintypes.DWORD * max_pids)()
    bytes_returned = wintypes.DWORD()

    if not EnumProcesses(pids_array, ctypes.sizeof(pids_array), ctypes.byref(bytes_returned)):
        return

    num_processes = bytes_returned.value // ctypes.sizeof(wintypes.DWORD)
    current_pid = os.getpid()

    for i in range(num_processes):
        pid = pids_array[i]
        if pid <= 4 or pid == current_pid:
            # Skip System Idle Process (PID 0), System (PID 4), and Self
            continue

        # Attempt to open process with rights needed to query filename and set quota
        desired_access = PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA
        h_process = OpenProcess(desired_access, False, pid)

        if not h_process:
            continue

        try:
            image_name = get_process_image_name(h_process)
            
            # Check exclusions
            if image_name and image_name in EXCLUDED_PROCESSES:
                continue

            # Trim Working Set
            EmptyWorkingSet(h_process)
        except Exception:
            # Safely catch any exception to ensure sentinel loop never crashes
            pass
        finally:
            CloseHandle(h_process)


# ==========================================
# MAIN SENTINEL LOOP
# ==========================================

def run_sentinel():
    """Continuous background monitoring daemon."""
    while True:
        try:
            mem_load = get_memory_load_percentage()
            if mem_load >= RAM_THRESHOLD_PERCENT:
                purge_working_sets()
                time.sleep(COOLDOWN_SECONDS)
            else:
                time.sleep(CHECK_INTERVAL_SECONDS)
        except Exception:
            # Prevent unexpected loop termination
            time.sleep(CHECK_INTERVAL_SECONDS)


if __name__ == '__main__':
    run_sentinel()
