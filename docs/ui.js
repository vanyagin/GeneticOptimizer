/* Привязка интерфейса к вычислительному ядру (браузерная версия). */
(function () {
  'use strict';
  var O = window.Optimizer;

  function distinctVars(func) {
    var m = func.match(/x\d+/g) || [];
    var set = {};
    m.forEach(function (v) { set[v] = true; });
    return Object.keys(set).sort(function (a, b) { return parseInt(a.slice(1)) - parseInt(b.slice(1)); });
  }

  function toggleRangeInputs() {
    var container = document.getElementById('rangeInputs');
    var checked = document.getElementById('customRangeCheckbox').checked;
    if (checked) {
      var vars = distinctVars(document.getElementById('function').value);
      container.innerHTML = '';
      vars.forEach(function (v) {
        var row = document.createElement('div');
        row.className = 'range-row';
        row.innerHTML =
          '<label for="' + v + '_min">' + v + ':</label>' +
          '<input name="' + v + '_min" type="number" step="any" required placeholder="от">' +
          '<span>–</span>' +
          '<input name="' + v + '_max" type="number" step="any" required placeholder="до">';
        container.appendChild(row);
      });
      container.style.display = 'block';
    } else {
      container.innerHTML = '';
      container.style.display = 'none';
    }
  }
  window.toggleRangeInputs = toggleRangeInputs;

  function onAlgoChange() {
    var algo = document.querySelector('input[name="algorithm"]:checked').value;
    var deParams = document.getElementById('deParams_input');
    if (deParams) deParams.style.display = algo === 'woa' ? 'none' : '';
  }
  window.onAlgoChange = onAlgoChange;

  function renderConvergenceChart(containerId, data) {
    var el = document.getElementById(containerId);
    if (!data.costs || data.costs.length === 0) { el.innerHTML = ''; return; }
    var FLOOR = 1e-10;
    var yValues = data.costs.map(function (c) { return Math.max(c, FLOOR); });
    var hasNegative = data.costs.some(function (c) { return c < 0; });
    var trace = {
      x: data.iterations, y: yValues, mode: 'lines', name: 'f(x*)',
      line: { color: '#007acc', width: 2 },
      hovertemplate: 'Итерация %{x}<br>f(x*) = %{y:.2e}<extra></extra>'
    };
    var shapes = [], annotations = [];
    if (data.eps_iter > 0) {
      shapes.push({ type: 'line', x0: data.eps_iter, x1: data.eps_iter, y0: 0, y1: 1, yref: 'paper',
        line: { color: '#d04040', dash: 'dot', width: 1.5 } });
      annotations.push({ x: data.eps_iter, y: 0.97, yref: 'paper',
        text: 'ε достигнут<br>(итер. ' + data.eps_iter + ')', showarrow: false,
        font: { color: '#d04040', size: 11 }, xanchor: 'left', align: 'left' });
    }
    Plotly.newPlot(el, [trace], {
      title: { text: 'Сходимость алгоритма', font: { size: 14 } },
      xaxis: { title: 'Итерация', zeroline: false },
      yaxis: { title: 'f(x*)', type: hasNegative ? 'linear' : 'log', zeroline: false },
      shapes: shapes, annotations: annotations,
      margin: { t: 45, r: 20, l: 65, b: 50 }, height: 320,
      paper_bgcolor: '#fff', plot_bgcolor: '#f5f7ff', showlegend: false
    }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] });
  }

  function showLoading() {
    var resp = document.getElementById('serverResponse_input');
    document.getElementById('resultPod_input').style.display = 'block';
    document.getElementById('chartPod_input').style.display = 'none';
    document.getElementById('convergenceChart_input').innerHTML = '';
    resp.className = 'server-response';
    resp.innerHTML = '<span class="loading"><span class="spinner"></span>Идёт поиск минимума функции…</span>';
  }

  function showResult(data) {
    var resp = document.getElementById('serverResponse_input');
    var chartPod = document.getElementById('chartPod_input');
    document.getElementById('resultPod_input').style.display = 'block';
    if (data.error) {
      resp.textContent = data.error;
      resp.className = 'server-response server-response--error';
      chartPod.style.display = 'none';
      document.getElementById('convergenceChart_input').innerHTML = '';
      return;
    }
    resp.className = 'server-response';
    var agent = data.best_agent.length
      ? '(' + data.best_agent.map(function (v) { return v.toFixed(6); }).join(', ') + ')' : '—';
    var lastCost = data.costs.length ? data.costs[data.costs.length - 1].toExponential(4) : '—';
    var epsLine = data.eps_iter > 0
      ? 'Итерация достижения точности: ' + data.eps_iter
      : 'Требуемая точность не достигнута';
    resp.textContent = 'Лучшая точка: ' + agent + '\nf(x*) = ' + lastCost + '\n' + epsLine;
    if (data.costs && data.costs.length) {
      chartPod.style.display = 'block';
      renderConvergenceChart('convergenceChart_input', data);
    } else {
      chartPod.style.display = 'none';
    }
  }

  function num(name, def) {
    var el = document.querySelector('[name="' + name + '"]');
    var v = el ? parseFloat(el.value) : NaN;
    return isNaN(v) ? def : v;
  }

  function runOptimization() {
    var func = document.getElementById('function').value.trim();
    var algorithm = document.querySelector('input[name="algorithm"]:checked').value;
    var useRanges = document.getElementById('customRangeCheckbox').checked;
    var advanced = document.getElementById('advancedSettingsCheckbox').checked;

    var compiled;
    try { compiled = O.compile(func); }
    catch (e) { showResult({ error: 'Ошибка в формуле: ' + e.message }); return; }

    var nP = compiled.nVars;
    if (nP < 1) { showResult({ error: 'В функции нет переменных вида x0, x1, …' }); return; }

    var lower = new Array(nP), upper = new Array(nP);
    for (var d = 0; d < nP; d++) { lower[d] = -5; upper[d] = 5; }
    if (useRanges) {
      for (var d2 = 0; d2 < nP; d2++) {
        var lo = document.querySelector('[name="x' + d2 + '_min"]');
        var hi = document.querySelector('[name="x' + d2 + '_max"]');
        if (lo && hi) {
          var lv = parseFloat(lo.value), hv = parseFloat(hi.value);
          if (!isNaN(lv) && !isNaN(hv)) {
            if (lv >= hv) { showResult({ error: 'Диапазон x' + d2 + ': «от» должно быть меньше «до».' }); return; }
            lower[d2] = lv; upper[d2] = hv;
          }
        }
      }
    }

    var pop = advanced ? Math.max(4, Math.round(num('populationSize', 50))) : 50;
    var F = advanced ? num('F', 0.65) : 0.65;
    var CR = advanced ? num('CR', 0.5) : 0.5;
    var E = advanced ? Math.round(num('Eps', 5)) : 5;
    var maxIter = advanced ? Math.max(1, Math.round(num('maxIterations', 200))) : 200;
    var seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;

    var opts = { f: function (x) { return compiled.eval(x); }, nParams: nP,
      populationSize: pop, lower: lower, upper: upper, F: F, CR: CR, E: E,
      maxIterations: maxIter, seed: seed };

    try {
      var res = (algorithm === 'woa') ? O.runWOA(opts) : O.runDE(opts);
      // защита от NaN/Inf в формуле
      if (!isFinite(res.costs[res.costs.length - 1])) {
        showResult({ error: 'Функция возвращает не число на части области (деление на 0, log от ≤0 и т.п.). Сузьте диапазоны.' });
        return;
      }
      showResult(res);
    } catch (e) {
      showResult({ error: 'Ошибка вычисления: ' + e.message });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('advancedSettingsCheckbox').addEventListener('change', function () {
      document.getElementById('advancedSettings').classList.toggle('hidden', !this.checked);
    });
    document.getElementById('functionForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = '…';
      showLoading();
      // даём интерфейсу отрисовать спиннер до тяжёлых вычислений
      setTimeout(function () {
        runOptimization();
        btn.disabled = false; btn.textContent = '=';
      }, 30);
    });
  });
})();
