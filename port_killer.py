#!/usr/bin/env python3
"""
ULTIMATE PORT DIAGNOSTIC AND KILLER
Finds EVERYTHING using ports and kills it all
"""

import subprocess
import os
import signal
import time
import sys

def find_all_methods(port):
    """Use every possible method to find what's using a port"""
    
    print(f"\n{'='*70}")
    print(f"DEEP SCAN: PORT {port}")
    print(f"{'='*70}\n")
    
    all_pids = set()
    
    # Method 1: lsof - List Open Files command
    print("[1] Checking with lsof...")
    try:
        result = subprocess.run(['lsof', '-ti', f':{port}'], 
                              capture_output=True, text=True, timeout=5)
        if result.stdout.strip():
            pids = [int(p) for p in result.stdout.strip().split('\n') if p]
            all_pids.update(pids)
            print(f"    Found: {pids}")
        else:
            print(f"    Nothing found")
    except Exception as e:
        print(f"    Error: {e}")
    
    # Method 2: fuser - Identify processes using files or sockets
    print("\n[2] Checking with fuser...")
    try:
        result = subprocess.run(['fuser', f'{port}/tcp'], 
                              capture_output=True, text=True, timeout=5)
        if result.stdout.strip():
            pids = [int(p) for p in result.stdout.strip().split() if p.isdigit()]
            all_pids.update(pids)
            print(f"    Found: {pids}")
        else:
            print(f"    Nothing found")
    except Exception as e:
        print(f"    Error: {e}")
    
    # Method 3: netstat - Network statistics
    print("\n[3] Checking with netstat...")
    try:
        result = subprocess.run(['netstat', '-tulpn'], 
                              capture_output=True, text=True, timeout=5)
        for line in result.stdout.split('\n'):
            if f':{port}' in line and 'LISTEN' in line:
                parts = line.split()
                for part in parts:
                    if '/' in part:
                        pid_str = part.split('/')[0]
                        if pid_str.isdigit():
                            all_pids.add(int(pid_str))
                            print(f"    Found: {pid_str} ({part})")
    except Exception as e:
        print(f"    Error: {e}")
    
    # Method 4: ss - Socket statistics
    print("\n[4] Checking with ss...")
    try:
        result = subprocess.run(['ss', '-tulpn'], 
                              capture_output=True, text=True, timeout=5)
        for line in result.stdout.split('\n'):
            if f':{port}' in line:
                # Look for pid=XXXX pattern
                import re
                matches = re.findall(r'pid=(\d+)', line)
                if matches:
                    pids = [int(m) for m in matches]
                    all_pids.update(pids)
                    print(f"    Found: {pids}")
    except Exception as e:
        print(f"    Error: {e}")
    
    # Method 5: Check /proc filesystem directly
    print("\n[5] Checking /proc filesystem...")
    try:
        # List all PIDs
        pids_in_proc = [int(d) for d in os.listdir('/proc') if d.isdigit()]
        
        for pid in pids_in_proc:
            try:
                # Check each process's file descriptors
                fd_path = f'/proc/{pid}/fd'
                if os.path.exists(fd_path):
                    for fd in os.listdir(fd_path):
                        try:
                            link = os.readlink(f'{fd_path}/{fd}')
                            if f':{port}' in link or f'TCP' in link:
                                all_pids.add(pid)
                                print(f"    Found: {pid} (via /proc)")
                                break
                        except:
                            pass
            except:
                pass
    except Exception as e:
        print(f"    Error: {e}")
    
    return list(all_pids)

def get_process_details(pid):
    """Get detailed information about a process"""
    
    details = {}
    
    try:
        # Get command line
        with open(f'/proc/{pid}/cmdline', 'r') as f:
            cmdline = f.read().replace('\x00', ' ').strip()
            details['cmdline'] = cmdline
    except:
        details['cmdline'] = 'Unknown'
    
    try:
        # Get process name
        result = subprocess.run(['ps', '-p', str(pid), '-o', 'comm='],
                              capture_output=True, text=True, timeout=1)
        details['name'] = result.stdout.strip()
    except:
        details['name'] = 'Unknown'
    
    try:
        # Get status
        result = subprocess.run(['ps', '-p', str(pid), '-o', 'stat='],
                              capture_output=True, text=True, timeout=1)
        details['status'] = result.stdout.strip()
    except:
        details['status'] = 'Unknown'
    
    try:
        # Get parent PID
        result = subprocess.run(['ps', '-p', str(pid), '-o', 'ppid='],
                              capture_output=True, text=True, timeout=1)
        details['ppid'] = result.stdout.strip()
    except:
        details['ppid'] = 'Unknown'
    
    return details

def nuclear_kill(pid):
    """Kill a process with every method possible"""
    
    methods_tried = []
    
    # Method 1: Python os.kill with SIGKILL
    try:
        os.kill(pid, signal.SIGKILL)
        methods_tried.append("os.kill(SIGKILL)")
    except:
        pass
    
    # Method 2: kill -9
    try:
        subprocess.run(['kill', '-9', str(pid)], stderr=subprocess.DEVNULL, timeout=2)
        methods_tried.append("kill -9")
    except:
        pass
    
    # Method 3: kill -KILL
    try:
        subprocess.run(['kill', '-KILL', str(pid)], stderr=subprocess.DEVNULL, timeout=2)
        methods_tried.append("kill -KILL")
    except:
        pass
    
    # Method 4: Multiple signals
    for sig in [signal.SIGKILL, signal.SIGTERM, signal.SIGKILL]:
        try:
            os.kill(pid, sig)
            methods_tried.append(f"signal.{sig}")
        except:
            pass
    
    return methods_tried

def main():
    print("""
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║        ULTIMATE PORT DIAGNOSTIC & KILLER                      ║
║                                                               ║
║          Deep Scan + Nuclear Annihilation Mode                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    """)
    
    # Ports to kill
    if len(sys.argv) > 1:
        ports = [int(p) for p in sys.argv[1:]]
    else:
        ports = [3000, 3001, 3002, 8000]
    
    print(f"\nTARGET PORTS: {ports}")
    
    all_results = {}
    
    for port in ports:
        # Deep scan
        pids = find_all_methods(port)
        
        if not pids:
            print(f"\nPort {port}: CLEAR (nothing found)")
            all_results[port] = []
            continue
        
        print(f"\n{'='*70}")
        print(f"FOUND {len(pids)} PROCESS(ES) ON PORT {port}")
        print(f"{'='*70}")
        
        # Show details for each process
        for pid in pids:
            details = get_process_details(pid)
            print(f"\nPID {pid}:")
            print(f"   Name:    {details['name']}")
            print(f"   Status:  {details['status']}")
            print(f"   Parent:  {details['ppid']}")
            print(f"   Command: {details['cmdline'][:70]}")
        
        # Kill them all
        print(f"\n{'='*70}")
        print(f"EXECUTING KILL SEQUENCE FOR PORT {port}")
        print(f"{'='*70}\n")
        
        for pid in pids:
            print(f"Targeting PID {pid}...")
            
            # Nuclear kill
            methods = nuclear_kill(pid)
            print(f"   Executed {len(methods)} kill methods: {', '.join(methods)}")
            
            time.sleep(0.1)
            
            # Check if dead
            try:
                os.kill(pid, 0)  # Signal 0 = check if alive
                print(f"   Still alive after kill attempt!")
                
                # Try killing parent
                details = get_process_details(pid)
                if details['ppid'] and details['ppid'] != '1':
                    print(f"   Killing parent PID {details['ppid']}...")
                    try:
                        os.kill(int(details['ppid']), signal.SIGKILL)
                    except:
                        pass
                
            except ProcessLookupError:
                print(f"   Confirmed DEAD")
        
        time.sleep(0.5)
        
        # Final verification
        final_pids = find_all_methods(port)
        all_results[port] = final_pids
    
    # Final report
    print(f"\n{'='*70}")
    print("FINAL STATUS REPORT")
    print(f"{'='*70}\n")
    
    all_clear = True
    for port in ports:
        pids = all_results.get(port, [])
        if pids:
            print(f"Port {port}: STILL OCCUPIED by PIDs {pids}")
            all_clear = False
            
            # Show what they are
            for pid in pids:
                details = get_process_details(pid)
                if 'Z' in details.get('status', ''):
                    print(f"     └─ PID {pid} is a ZOMBIE (defunct)")
        else:
            print(f"Port {port}: CLEAR")
    
    print(f"\n{'='*70}")
    if all_clear:
        print("ALL PORTS SECURED - MISSION ACCOMPLISHED")
    else:
        print("Some processes remain (likely zombies)")
        print("Tip: Zombies are already dead, just not reaped by parent")
        print("Tip: The ports should still be usable")
    print(f"{'='*70}\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nOperation aborted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nCritical error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)