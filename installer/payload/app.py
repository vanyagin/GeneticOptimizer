# -*- coding: utf-8 -*-
"""
Оптимизатор функций — локальный веб-интерфейс.
Запускает GeneticAlgoritm.exe (DE/WOA) и строит график сходимости в браузере.
Версия для локальной установки: production-сервер waitress, авто-выбор порта,
автоматическое открытие браузера. Интернет не требуется.
"""
import os
import re
import sys
import socket
import threading
import webbrowser
import subprocess

from flask import Flask, request, render_template, jsonify

# Каталог, где лежит этот файл (он же каталог установки).
APP_DIR = os.path.dirname(os.path.abspath(__file__))
EXE_PATH = os.path.join(APP_DIR, 'GeneticAlgoritm.exe')

# На Windows прячем консольное окно дочернего процесса.
_CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(APP_DIR, 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)


def _run_exe(command):
    """Запуск GeneticAlgoritm.exe без всплывающего консольного окна."""
    return subprocess.run(
        command, capture_output=True, text=True, check=True,
        cwd=APP_DIR, creationflags=_CREATE_NO_WINDOW,
    )


def parse_de_output(output):
    iterations, costs, best_agent = [], [], []
    eps_iter = -1
    for line in output.splitlines():
        m = re.match(r'Current minimal cost:\s+([-\d.eE+]+)\s+Best agent:\s+(.*)', line)
        if m:
            iterations.append(len(iterations) + 1)
            costs.append(float(m.group(1)))
            best_agent = [float(v) for v in m.group(2).split()]
        m2 = re.match(r'Iteration of the first achievement[^:]*:\s+(-?\d+)', line)
        if m2:
            eps_iter = int(m2.group(1))
    return {
        "iterations": iterations,
        "costs": costs,
        "best_agent": best_agent,
        "eps_iter": eps_iter,
    }


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/submit-function', methods=['POST'])
def submit_function():
    function   = request.form.get('function')
    use_ranges = request.form.get('customRangeCheckbox') == 'on'
    advanced   = request.form.get('advancedSettingsCheckbox') == 'on'
    algorithm  = request.form.get('algorithm', 'de')

    ranges = {}
    arg_count = -1

    if use_ranges:
        for key in request.form:
            if key.endswith('_min') or key.endswith('_max'):
                var_name = key.rsplit('_', 1)[0]
                if var_name not in ranges:
                    ranges[var_name] = {}
                if key.endswith('_min'):
                    ranges[var_name]['min'] = float(request.form[key])
                else:
                    ranges[var_name]['max'] = float(request.form[key])
    else:
        variables = set(re.findall(r'x\d+', function))
        arg_count = len(variables)
        for var in variables:
            ranges[var] = {'min': -5, 'max': 5}

    sorted_vars = sorted(ranges.keys(), key=lambda x: int(x[1:]))

    population = '50'
    F          = '0.65'
    CR         = '0.5'
    eps        = '5'
    max_iter   = '200'

    if advanced:
        population = request.form.get('populationSize', population)
        F          = request.form.get('F', F)
        CR         = request.form.get('CR', CR)
        eps        = request.form.get('Eps', eps)
        max_iter   = request.form.get('maxIterations', max_iter)

    with open(os.path.join(APP_DIR, 'data.txt'), 'w') as f:
        f.write(function + '\n')
        for var in sorted_vars:
            limits = ranges[var]
            f.write(f"{var}: {limits['min']} {limits['max']}\n")

    command = [EXE_PATH, algorithm, 'file', str(arg_count),
               population, F, CR, eps, max_iter]
    try:
        result = _run_exe(command)
        return jsonify(parse_de_output(result.stdout))
    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Ошибка при запуске GeneticAlgoritm.exe:\n{e.stderr or str(e)}",
                        "iterations": [], "costs": [], "best_agent": [], "eps_iter": -1})


@app.route('/submit-file', methods=['POST'])
def submit_file():
    file      = request.files['file']
    arg_count = request.form.get('argCount')
    algorithm = request.form.get('algorithm', 'de')

    if not file:
        return jsonify({"error": "Файл не загружен"}), 400

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
    file.save(filepath)

    population = request.form.get('populationSize', '20')
    F          = request.form.get('F', '0.65')
    CR         = request.form.get('CR', '0.5')
    eps        = request.form.get('Eps', '2')
    max_iter   = request.form.get('maxIterations', '20')

    command = [EXE_PATH, algorithm, file.filename, arg_count,
               population, F, CR, eps, max_iter]
    try:
        result = _run_exe(command)
        return jsonify(parse_de_output(result.stdout))
    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Ошибка при запуске GeneticAlgoritm.exe:\n{e.stderr or str(e)}",
                        "iterations": [], "costs": [], "best_agent": [], "eps_iter": -1})


def _find_free_port(preferred=5000):
    """Берём 5000, если занят — просим ОС выдать любой свободный."""
    for port in (preferred,):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                pass
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def main():
    port = _find_free_port(5000)
    url = f"http://127.0.0.1:{port}/"

    # Открываем браузер чуть позже, когда сервер уже поднимется.
    threading.Timer(1.2, lambda: webbrowser.open(url)).start()

    print(f"Оптимизатор функций запущен: {url}")
    print("Чтобы закрыть приложение, закройте это окно.")

    try:
        from waitress import serve
        serve(app, host='127.0.0.1', port=port, threads=4)
    except ImportError:
        # Запасной вариант — встроенный сервер Flask.
        app.run(host='127.0.0.1', port=port, debug=False, use_reloader=False)


if __name__ == '__main__':
    main()
