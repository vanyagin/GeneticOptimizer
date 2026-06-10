/* =========================================================================
 *  Оптимизатор функций — вычислительное ядро (браузерная версия)
 *  Парсер формул (семантика muparser) + DE (jDE) + WOA.
 *  Чистый JS, без внешних зависимостей. Работает и в браузере, и в Node.
 * ========================================================================= */
(function (root) {
  'use strict';

  /* ---------------------- Разбор и вычисление формулы ------------------- */

  var CONSTS = { '_pi': Math.PI, 'pi': Math.PI, '_e': Math.E, 'e': Math.E };

  var FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs,
    log: Math.log, ln: Math.log,
    log2: function (x) { return Math.log(x) / Math.LN2; },
    log10: function (x) { return Math.log(x) / Math.LN10; },
    sign: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    pow: Math.pow, atan2: Math.atan2,
    min: function () { return Math.min.apply(null, arguments); },
    max: function () { return Math.max.apply(null, arguments); },
    sum: function () { var s = 0; for (var i = 0; i < arguments.length; i++) s += arguments[i]; return s; },
    avg: function () { var s = 0; for (var i = 0; i < arguments.length; i++) s += arguments[i]; return s / arguments.length; }
  };
  var FIXED_ARITY = { pow: 2, atan2: 2 };

  function tokenize(expr) {
    var tokens = [], i = 0, n = expr.length;
    var isDigit = function (c) { return c >= '0' && c <= '9'; };
    var isAlpha = function (c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'; };
    while (i < n) {
      var c = expr[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (isDigit(c) || (c === '.' && isDigit(expr[i + 1]))) {
        var j = i;
        while (j < n && (isDigit(expr[j]) || expr[j] === '.')) j++;
        if (expr[j] === 'e' || expr[j] === 'E') {
          j++;
          if (expr[j] === '+' || expr[j] === '-') j++;
          while (j < n && isDigit(expr[j])) j++;
        }
        tokens.push({ t: 'num', v: parseFloat(expr.slice(i, j)) });
        i = j; continue;
      }
      if (isAlpha(c)) {
        var k = i;
        while (k < n && (isAlpha(expr[k]) || isDigit(expr[k]))) k++;
        tokens.push({ t: 'name', v: expr.slice(i, k) });
        i = k; continue;
      }
      if ('+-*/^(),'.indexOf(c) !== -1) { tokens.push({ t: 'op', v: c }); i++; continue; }
      throw new Error('Недопустимый символ: "' + c + '"');
    }
    return tokens;
  }

  var PREC = { 'u-': 3, 'u+': 3, '^': 4, '*': 3, '/': 3, '+': 2, '-': 2 };

  // Преобразование в обратную польскую запись (учёт унарного минуса и функций)
  function toRPN(tokens) {
    var out = [], ops = [], argc = [], maxVar = -1;
    var prevType = null; // null | 'num' | 'op' | 'open' | 'close' | 'func' | 'comma'

    function isOperand() { return prevType === 'num' || prevType === 'close'; }

    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];

      if (tk.t === 'num') {
        out.push({ t: 'num', v: tk.v }); prevType = 'num'; continue;
      }

      if (tk.t === 'name') {
        var nm = tk.v;
        if (/^x\d+$/.test(nm)) {
          var idx = parseInt(nm.slice(1), 10);
          if (idx > maxVar) maxVar = idx;
          out.push({ t: 'var', i: idx }); prevType = 'num';
        } else if (Object.prototype.hasOwnProperty.call(CONSTS, nm)) {
          out.push({ t: 'num', v: CONSTS[nm] }); prevType = 'num';
        } else if (Object.prototype.hasOwnProperty.call(FUNCS, nm)) {
          ops.push({ t: 'func', name: nm }); argc.push(1); prevType = 'func';
        } else {
          throw new Error('Неизвестное имя: "' + nm + '"');
        }
        continue;
      }

      var c = tk.v;
      if (c === ',') {
        while (ops.length && !(ops[ops.length - 1].t === 'paren')) {
          out.push(ops.pop());
        }
        if (!ops.length) throw new Error('Лишняя запятая или нет скобок');
        argc[argc.length - 1]++;
        prevType = 'comma'; continue;
      }

      if (c === '(') { ops.push({ t: 'paren' }); prevType = 'open'; continue; }

      if (c === ')') {
        while (ops.length && ops[ops.length - 1].t !== 'paren') out.push(ops.pop());
        if (!ops.length) throw new Error('Непарная закрывающая скобка');
        ops.pop(); // убрать '('
        if (ops.length && ops[ops.length - 1].t === 'func') {
          var f = ops.pop();
          f.argc = argc.pop();
          out.push(f);
        }
        prevType = 'close'; continue;
      }

      // оператор + - * / ^
      var unary = (c === '-' || c === '+') && !isOperand();
      if (unary) {
        // префиксный унарный — кладём без выталкивания
        ops.push({ t: 'op', op: c === '-' ? 'u-' : 'u+' });
        prevType = 'op'; continue;
      }
      var o1 = c, p1 = PREC[o1], rightAssoc = (o1 === '^');
      while (ops.length) {
        var top = ops[ops.length - 1];
        if (top.t !== 'op') break;
        var p2 = PREC[top.op];
        if (p2 > p1 || (p2 === p1 && !rightAssoc)) out.push(ops.pop());
        else break;
      }
      ops.push({ t: 'op', op: o1 });
      prevType = 'op';
    }

    while (ops.length) {
      var x = ops.pop();
      if (x.t === 'paren') throw new Error('Непарная открывающая скобка');
      out.push(x);
    }
    return { rpn: out, nVars: maxVar + 1 };
  }

  // Компилирует выражение в объект-вычислитель
  function compile(expr) {
    if (!expr || !expr.trim()) throw new Error('Пустое выражение');
    var parsed = toRPN(tokenize(expr));
    var rpn = parsed.rpn;
    var stack = new Array(rpn.length + 1);

    function evaluate(vars) {
      var sp = 0;
      for (var i = 0; i < rpn.length; i++) {
        var it = rpn[i];
        switch (it.t) {
          case 'num': stack[sp++] = it.v; break;
          case 'var': stack[sp++] = vars[it.i] || 0; break;
          case 'op':
            if (it.op === 'u-') { stack[sp - 1] = -stack[sp - 1]; }
            else if (it.op === 'u+') { /* нет изменений */ }
            else {
              var b = stack[--sp], a = stack[--sp], r;
              switch (it.op) {
                case '+': r = a + b; break;
                case '-': r = a - b; break;
                case '*': r = a * b; break;
                case '/': r = a / b; break;
                case '^': r = Math.pow(a, b); break;
              }
              stack[sp++] = r;
            }
            break;
          case 'func':
            var args = new Array(it.argc);
            for (var k = it.argc - 1; k >= 0; k--) args[k] = stack[--sp];
            stack[sp++] = FUNCS[it.name].apply(null, args);
            break;
        }
      }
      return stack[0];
    }
    return { nVars: parsed.nVars, eval: evaluate };
  }

  /* --------------------------- ГПСЧ (mulberry32) ----------------------- */
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------ Дифференциальная эволюция (jDE) ------------- */
  // Возвращает {iterations, costs, best_agent, eps_iter}
  function runDE(opts) {
    var f = opts.f, nP = opts.nParams, pop = opts.populationSize;
    var lower = opts.lower, upper = opts.upper;
    var F0 = opts.F, CR0 = opts.CR, E = opts.E, p = opts.p || 0.1;
    var maxIter = opts.maxIterations;
    var rand = makeRng(opts.seed >>> 0);
    var eps = Math.pow(10, -E);

    var randint = function (m) { return Math.floor(rand() * m) % m; };

    var X = [], cost = [], Fv = [], CRv = [];
    var minCost = Infinity, bestIdx = 0;
    for (var i = 0; i < pop; i++) {
      var a = new Array(nP);
      for (var d = 0; d < nP; d++) a[d] = lower[d] + rand() * (upper[d] - lower[d]);
      X.push(a); Fv.push(F0); CRv.push(CR0);
      var c = f(a); cost.push(c);
      if (c < minCost) { minCost = c; bestIdx = i; }
    }

    var tau1 = 0.1, tau2 = 0.1, F_lo = 0.1, F_hi = 0.9;
    var costs = [], iters = [];
    var eps_iter = -1, current_iter = 0;

    function step() {
      var pbestSize = Math.max(1, Math.floor(p * pop));
      var sorted = X.map(function (_, k) { return k; })
                    .sort(function (u, v) { return cost[u] - cost[v]; });
      var mc = cost[0], bi = 0;
      for (var x = 0; x < pop; x++) {
        var Fnew = (rand() < tau1) ? (F_lo + rand() * F_hi) : Fv[x];
        var CRnew = (rand() < tau2) ? rand() : CRv[x];
        var pbest = sorted[randint(pbestSize)];
        var r1 = x; while (r1 === x) r1 = randint(pop);
        var r2 = x; while (r2 === x || r2 === r1) r2 = randint(pop);
        var z = new Array(nP);
        for (var d = 0; d < nP; d++)
          z[d] = X[x][d] + Fnew * (X[pbest][d] - X[x][d]) + Fnew * (X[r1][d] - X[r2][d]);
        var R = randint(nP);
        var nx = new Array(nP);
        for (var d2 = 0; d2 < nP; d2++)
          nx[d2] = (rand() < CRnew || d2 === R) ? z[d2] : X[x][d2];
        // ограничения: отбраковка (как в C++), но с защитой от зацикливания
        var ok = true;
        for (var d3 = 0; d3 < nP; d3++) if (nx[d3] < lower[d3] || nx[d3] > upper[d3]) { ok = false; break; }
        if (!ok) {
          if (!step._retry) step._retry = 0;
          if (step._retry++ < 60 * pop) { x--; continue; }
          for (var d4 = 0; d4 < nP; d4++) nx[d4] = Math.min(upper[d4], Math.max(lower[d4], nx[d4]));
        }
        step._retry = 0;
        var nc = f(nx);
        if (nc < cost[x]) { X[x] = nx; cost[x] = nc; Fv[x] = Fnew; CRv[x] = CRnew; }
        if (cost[x] < mc) { mc = cost[x]; bi = x; }
      }
      minCost = mc; bestIdx = bi;
    }

    function record() {
      current_iter++;
      if (minCost <= eps && eps_iter === -1) eps_iter = current_iter;
      iters.push(current_iter);
      costs.push(minCost);
    }

    for (var it = 0; it < maxIter; it++) { step(); record(); }
    if (eps_iter === -1) {
      var k = 0;
      while (minCost > eps && k < 10) { k++; step(); record(); }
    }

    return { iterations: iters, costs: costs, best_agent: X[bestIdx].slice(), eps_iter: eps_iter };
  }

  /* --------------------- Алгоритм оптимизации китов (WOA) --------------- */
  function runWOA(opts) {
    var f = opts.f, nP = opts.nParams, pop = opts.populationSize;
    var lower = opts.lower, upper = opts.upper;
    var E = opts.E, b = opts.b || 1.0, maxIter = opts.maxIterations;
    var rand = makeRng(opts.seed >>> 0);
    var eps = Math.pow(10, -E);
    var PI = Math.PI;
    var randint = function (m) { return Math.floor(rand() * m) % m; };

    var X = [], cost = [], minCost = Infinity, bestIdx = 0;
    for (var i = 0; i < pop; i++) {
      var a = new Array(nP);
      for (var d = 0; d < nP; d++) a[d] = lower[d] + rand() * (upper[d] - lower[d]);
      X.push(a);
      var c = f(a); cost.push(c);
      if (c < minCost) { minCost = c; bestIdx = i; }
    }

    var costs = [], iters = [], eps_iter = -1, current_iter = 0;

    function step(aCoef) {
      var best = X[bestIdx].slice();
      for (var i = 0; i < pop; i++) {
        var r1 = rand(), r2 = rand();
        var A = 2 * aCoef * r1 - aCoef, C = 2 * r2;
        var l = -1 + rand() * 2, pp = rand();
        var np = new Array(nP), d;
        if (pp < 0.5) {
          if (Math.abs(A) < 1) {
            for (d = 0; d < nP; d++) { var D = Math.abs(C * best[d] - X[i][d]); np[d] = best[d] - A * D; }
          } else {
            var r = i; while (r === i) r = randint(pop);
            for (d = 0; d < nP; d++) { var D2 = Math.abs(C * X[r][d] - X[i][d]); np[d] = X[r][d] - A * D2; }
          }
        } else {
          for (d = 0; d < nP; d++) { var D3 = Math.abs(best[d] - X[i][d]); np[d] = D3 * Math.exp(b * l) * Math.cos(2 * PI * l) + best[d]; }
        }
        for (d = 0; d < nP; d++) np[d] = Math.min(upper[d], Math.max(lower[d], np[d]));
        var nc = f(np);
        if (nc < cost[i]) { X[i] = np; cost[i] = nc; if (nc < minCost) { minCost = nc; bestIdx = i; } }
      }
    }

    function record() {
      current_iter++;
      if (minCost <= eps && eps_iter === -1) eps_iter = current_iter;
      iters.push(current_iter); costs.push(minCost);
    }

    for (var t = 0; t < maxIter; t++) { step(2 - 2 * t / maxIter); record(); }
    if (eps_iter === -1) { for (var k = 0; k < 10 && minCost > eps; k++) { step(0); record(); } }

    return { iterations: iters, costs: costs, best_agent: X[bestIdx].slice(), eps_iter: eps_iter };
  }

  /* ------------------------------- экспорт ----------------------------- */
  var API = { compile: compile, runDE: runDE, runWOA: runWOA, makeRng: makeRng };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.Optimizer = API;
})(typeof window !== 'undefined' ? window : this);
