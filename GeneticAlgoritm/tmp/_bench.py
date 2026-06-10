# -*- coding: utf-8 -*-
import os, re, math, time, subprocess, json

APP = os.path.dirname(os.path.abspath(__file__))
EXE = os.path.join(APP, 'GeneticAlgoritm.exe')
DATA = os.path.join(APP, 'data.txt')

# ---- параметры эксперимента (одинаковы для обоих алгоритмов) ----
POP, F, CR, E, ITERS = 50, 0.65, 0.5, 6, 500
EPS = 10 ** (-E)

def sphere(n):      return "+".join(f"x{i}^2" for i in range(n))
def rosenbrock(n):  return "+".join(f"100*(x{i+1}-x{i}^2)^2+(1-x{i})^2" for i in range(n-1))
def rastrigin(n):   return f"{10*n}" + "".join(f"+(x{i}^2-10*cos(2*_pi*x{i}))" for i in range(n))
def ackley(n):
    s1 = "+".join(f"x{i}^2" for i in range(n))
    s2 = "+".join(f"cos(2*_pi*x{i})" for i in range(n))
    return f"-20*exp(-0.2*sqrt(({s1})/{n}))-exp(({s2})/{n})+20+_e"

HIMMEL_MIN = [(3,2),(-2.805118,3.131312),(-3.779310,-3.283186),(3.584428,-1.848126)]

# имя, n, выражение, [lo,hi], f*, функция x-ошибки(вектор)->float
def xerr_to(target):
    return lambda x: math.sqrt(sum((a-b)**2 for a,b in zip(x,target)))
def xerr_himmel(x):
    return min(math.sqrt((x[0]-a)**2+(x[1]-b)**2) for a,b in HIMMEL_MIN)

CASES = [
    ("Сфера",       2,  sphere(2),     -5.12, 5.12, 0.0, xerr_to([0]*2)),
    ("Сфера",      10,  sphere(10),    -5.12, 5.12, 0.0, xerr_to([0]*10)),
    ("Сфера",      30,  sphere(30),    -5.12, 5.12, 0.0, xerr_to([0]*30)),
    ("Розенброк",   2,  rosenbrock(2), -5.0,  5.0,  0.0, xerr_to([1]*2)),
    ("Розенброк",  10,  rosenbrock(10),-5.0,  5.0,  0.0, xerr_to([1]*10)),
    ("Растригин",   2,  rastrigin(2),  -5.12, 5.12, 0.0, xerr_to([0]*2)),
    ("Растригин",  10,  rastrigin(10), -5.12, 5.12, 0.0, xerr_to([0]*10)),
    ("Экли",        2,  ackley(2),     -5.0,  5.0,  0.0, xerr_to([0]*2)),
    ("Экли",       10,  ackley(10),    -5.0,  5.0,  0.0, xerr_to([0]*10)),
    ("Химмельблау", 2,  "(x0^2+x1-11)^2+(x0+x1^2-7)^2", -5.0, 5.0, 0.0, xerr_himmel),
]

def write_data(expr, n, lo, hi):
    with open(DATA, 'w') as f:
        f.write(expr + "\n")
        for i in range(n):
            f.write(f"x{i}: {lo} {hi}\n")

def parse(out):
    costs, best = [], []
    eps_iter = -1
    for line in out.splitlines():
        m = re.match(r'Current minimal cost:\s+([-\d.eE+]+)\s+Best agent:\s+(.*)', line)
        if m:
            costs.append(float(m.group(1)))
            best = [float(v) for v in m.group(2).split()]
        m2 = re.match(r'Iteration of the first achievement[^:]*:\s+(-?\d+)', line)
        if m2:
            eps_iter = int(m2.group(1))
    return costs, best, eps_iter

def run(algo, expr, n, lo, hi):
    write_data(expr, n, lo, hi)
    cmd = [EXE, algo, 'file', '0', str(POP), str(F), str(CR), str(E), str(ITERS)]
    t0 = time.perf_counter()
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=APP)
    dt = time.perf_counter() - t0
    costs, best, eps_iter = parse(r.stdout)
    return {
        "gens": len(costs),
        "fbest": costs[-1] if costs else float('nan'),
        "best": best,
        "eps_iter": eps_iter,
        "time": dt,
    }

rows = []
for algo in ("de", "woa"):
    for (name, n, expr, lo, hi, fopt, xerr) in CASES:
        res = run(algo, expr, n, lo, hi)
        ferr = abs(res["fbest"] - fopt)
        xe = xerr(res["best"]) if res["best"] else float('nan')
        reached = res["eps_iter"] > 0
        t_to_eps = (res["time"] * res["eps_iter"] / res["gens"]) if reached and res["gens"] else None
        rows.append({
            "algo": algo, "name": name, "n": n, "fopt": fopt,
            "fbest": res["fbest"], "ferr": ferr, "xerr": xe,
            "eps_iter": res["eps_iter"], "gens": res["gens"],
            "time": res["time"], "t_to_eps": t_to_eps,
            "best": res["best"], "reached": reached,
        })
        print(f"[{algo}] {name} n={n}: f={res['fbest']:.3e} ferr={ferr:.2e} "
              f"xerr={xe:.2e} eps_iter={res['eps_iter']} gens={res['gens']} t={res['time']:.3f}s")

with open(os.path.join(APP, '_bench_results.json'), 'w', encoding='utf-8') as f:
    json.dump({"params": {"POP":POP,"F":F,"CR":CR,"E":E,"ITERS":ITERS,"EPS":EPS}, "rows": rows},
              f, ensure_ascii=False, indent=2)
print("\nSaved _bench_results.json")
