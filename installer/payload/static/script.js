function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tabs button').forEach(btn => btn.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  const index = tabId === 'inputTab' ? 0 : 1;
  document.querySelectorAll('.tabs button')[index].classList.add('active');
}

function onAlgoChange(tabId) {
  const formId = tabId === 'input' ? 'functionForm' : 'fileForm';
  const form = document.getElementById(formId);
  const algo = form.querySelector('input[name="algorithm"]:checked').value;
  const deParams = document.getElementById('deParams_' + tabId);
  if (deParams) {
    deParams.style.display = algo === 'woa' ? 'none' : '';
  }
}

function toggleRangeInputs() {
  const container = document.getElementById('rangeInputs');
  const checked = document.getElementById('customRangeCheckbox').checked;
  const hiddenInput = document.getElementById('customRangeHidden');

  if (checked) {
    hiddenInput.value = 'on';
    const func = document.getElementById('function').value;
    const variables = [...new Set(func.match(/x\d+/g))];
    container.innerHTML = '';
    variables.forEach(v => {
      const row = document.createElement('div');
      row.className = 'range-row';
      row.innerHTML = `
        <label for="${v}_min">${v}:</label>
        <input name="${v}_min" type="number" step="any" required placeholder="от">
        <span>–</span>
        <input name="${v}_max" type="number" step="any" required placeholder="до">
      `;
      container.appendChild(row);
    });
    container.style.display = 'block';
  } else {
    hiddenInput.value = 'off';
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

function renderConvergenceChart(containerId, data) {
  const el = document.getElementById(containerId);
  if (!data.costs || data.costs.length === 0) {
    el.innerHTML = '';
    return;
  }

  const FLOOR = 1e-10;
  const yValues = data.costs.map(c => Math.max(c, FLOOR));
  const hasNegative = data.costs.some(c => c < 0);

  const trace = {
    x: data.iterations,
    y: yValues,
    mode: 'lines',
    name: 'f(x*)',
    line: { color: '#007acc', width: 2 },
    hovertemplate: 'Итерация %{x}<br>f(x*) = %{y:.2e}<extra></extra>'
  };

  const shapes = [];
  const annotations = [];
  if (data.eps_iter > 0) {
    shapes.push({
      type: 'line',
      x0: data.eps_iter, x1: data.eps_iter,
      y0: 0, y1: 1, yref: 'paper',
      line: { color: '#d04040', dash: 'dot', width: 1.5 }
    });
    annotations.push({
      x: data.eps_iter, y: 0.97, yref: 'paper',
      text: `ε достигнут<br>(итер. ${data.eps_iter})`,
      showarrow: false,
      font: { color: '#d04040', size: 11 },
      xanchor: 'left', align: 'left'
    });
  }

  Plotly.newPlot(el, [trace], {
    title: { text: 'Сходимость алгоритма', font: { size: 14 } },
    xaxis: { title: 'Итерация', zeroline: false },
    yaxis: { title: 'f(x*)', type: hasNegative ? 'linear' : 'log', zeroline: false },
    shapes,
    annotations,
    margin: { t: 45, r: 20, l: 65, b: 50 },
    height: 320,
    paper_bgcolor: '#fff',
    plot_bgcolor: '#f5f7ff',
    showlegend: false
  }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] });
}

function showLoading(suffix) {
  const respEl = document.getElementById('serverResponse_' + suffix);
  document.getElementById('resultPod_' + suffix).style.display = 'block';
  document.getElementById('chartPod_' + suffix).style.display = 'none';
  document.getElementById('convergenceChart_' + suffix).innerHTML = '';
  respEl.className = 'server-response';
  respEl.innerHTML =
    '<span class="loading"><span class="spinner"></span>' +
    'Идёт поиск минимума функции… Это может занять некоторое время.</span>';
}

function showResult(suffix, data) {
  const respEl = document.getElementById('serverResponse_' + suffix);
  const resultPod = document.getElementById('resultPod_' + suffix);
  const chartPod = document.getElementById('chartPod_' + suffix);
  const chartId = 'convergenceChart_' + suffix;

  resultPod.style.display = 'block';

  if (data.error) {
    respEl.textContent = data.error;
    respEl.className = 'server-response server-response--error';
    chartPod.style.display = 'none';
    document.getElementById(chartId).innerHTML = '';
    return;
  }
  respEl.className = 'server-response';

  const agent = data.best_agent.length
    ? '(' + data.best_agent.map(v => v.toFixed(6)).join(', ') + ')'
    : '—';
  const lastCost = data.costs.length
    ? data.costs[data.costs.length - 1].toExponential(4)
    : '—';
  const epsLine = data.eps_iter > 0
    ? `Итерация достижения точности: ${data.eps_iter}`
    : 'Требуемая точность не достигнута';

  respEl.textContent = `Лучшая точка: ${agent}\nf(x*) = ${lastCost}\n${epsLine}`;

  if (data.costs && data.costs.length) {
    chartPod.style.display = 'block';
    renderConvergenceChart(chartId, data);
  } else {
    chartPod.style.display = 'none';
    document.getElementById(chartId).innerHTML = '';
  }
}

document.getElementById('functionForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const rangeInputs = form.querySelectorAll('input[name$="_min"]');
  for (const input of rangeInputs) {
    const varName = input.name.replace('_min', '');
    const minVal = parseFloat(input.value);
    const maxVal = parseFloat(form.querySelector(`input[name="${varName}_max"]`).value);
    if (minVal >= maxVal) {
      alert(`Ошибка в диапазоне ${varName}: "от" должно быть меньше "до".`);
      return;
    }
  }

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '…';
  showLoading('input');

  try {
    const response = await fetch('/submit-function', { method: 'POST', body: new FormData(form) });
    const data = await response.json();
    showResult('input', data);
  } catch (err) {
    showResult('input', { error: `Ошибка: ${err}` });
  } finally {
    btn.disabled = false;
    btn.textContent = '=';
  }
});

document.getElementById('fileForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '…';
  showLoading('file');

  try {
    const response = await fetch('/submit-file', { method: 'POST', body: new FormData(e.target) });
    const data = await response.json();
    showResult('file', data);
  } catch (err) {
    showResult('file', { error: `Ошибка: ${err}` });
  } finally {
    btn.disabled = false;
    btn.textContent = '=';
  }
});

document.getElementById('advancedSettingsCheckbox').addEventListener('change', function () {
  document.getElementById('advancedSettings').classList.toggle('hidden', !this.checked);
});

document.getElementById('file').addEventListener('change', function () {
  document.getElementById('fileName').textContent =
    this.files.length ? this.files[0].name : 'файл не выбран';
});
