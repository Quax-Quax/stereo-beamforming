/**
 * ステレオマイク指向性強化アプリケーション
 * Web配信版メインスクリプト
 */

let audioContext = null;
let mediaStream = null;
let processor = null;
let sourceNode = null;
let analyzerInput = null;
let analyzerOutput = null;

const UI = {
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    statusText: document.getElementById('statusText'),
    statusIndicator: document.getElementById('statusIndicator'),
    errorBox: document.getElementById('errorBox'),
    micDistanceSlider: document.getElementById('micDistanceSlider'),
    micDistanceValue: document.getElementById('micDistanceValue'),
    methodButtons: document.querySelectorAll('.method-btn'),
    inputMeter: document.getElementById('inputMeter'),
    outputMeter: document.getElementById('outputMeter'),
    inputLevel: document.getElementById('inputLevel'),
    outputLevel: document.getElementById('outputLevel'),
    parameterSection: document.getElementById('parameterSection'),
    parameterControls: document.getElementById('parameterControls'),
    outputDeviceSelect: document.getElementById('outputDeviceSelect'),
    sinkIdStatus: document.getElementById('sinkIdStatus')
};

// イベントリスナー
UI.startBtn.addEventListener('click', startMicrophone);
UI.stopBtn.addEventListener('click', stopMicrophone);
UI.micDistanceSlider.addEventListener('input', updateMicDistance);
UI.methodButtons.forEach(btn => {
    btn.addEventListener('click', (e) => selectMethod(e.target.closest('button')));
});
UI.outputDeviceSelect.addEventListener('change', changeOutputDevice);

function updateStatus(text, isActive = false) {
    UI.statusText.textContent = text;
    UI.statusIndicator.classList.toggle('active', isActive);
}

function showError(message) {
    UI.errorBox.textContent = message;
    UI.errorBox.style.display = 'block';
    setTimeout(() => {
        UI.errorBox.style.display = 'none';
    }, 5000);
}

async function startMicrophone() {
    console.log('startMicrophone called');
    try {
        updateStatus('マイクへのアクセスを要求中...', false);
        console.log('updateStatus done');

        // AudioContext初期化
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('AudioContext created');
        }

        // マイク取得（ステレオ）
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 2,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });
        console.log('getUserMedia success');

        // AudioWorklet登録
        console.log('AudioWorklet loading...');
        await audioContext.audioWorklet.addModule('./audio-worklet.js');
        console.log('AudioWorklet loaded');

        // ソースノード作成
        sourceNode = audioContext.createMediaStreamSource(mediaStream);

        // AudioWorkletプロセッサ作成
        processor = new AudioWorkletNode(audioContext, 'beamforming-processor');
        processor.port.onmessage = (event) => {
            // プロセッサからのメッセージを処理（必要に応じて）
        };

        // アナライザー作成（メーター用）
        analyzerInput = audioContext.createAnalyser();
        analyzerInput.fftSize = 2048;
        analyzerOutput = audioContext.createAnalyser();
        analyzerOutput.fftSize = 2048;

        // ノード接続
        sourceNode.connect(analyzerInput);
        sourceNode.connect(processor);
        processor.connect(analyzerOutput);
        analyzerOutput.connect(audioContext.destination);
        console.log('Nodes connected');

        // 出力デバイスリストを更新
        try {
            await enumerateOutputDevices();
            console.log('enumerateOutputDevices completed');
        } catch (devError) {
            console.error('Device enumeration error:', devError);
            UI.sinkIdStatus.textContent = '⚠️ デバイス列挙失敗（HTTPS/localhost が必要）';
        }

        updateStatus('マイク処理中...', true);
        UI.startBtn.disabled = true;
        UI.stopBtn.disabled = false;
        UI.micDistanceSlider.disabled = false;

        // メーター更新ループ
        updateMeters();
        console.log('startMicrophone completed successfully');

    } catch (error) {
        console.error('マイク起動エラー:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        updateStatus('エラー', false);
        showError(`エラー: ${error.message}`);
    }
}

function stopMicrophone() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
    }

    sourceNode = null;
    processor = null;

    updateStatus('停止', false);
    UI.startBtn.disabled = false;
    UI.stopBtn.disabled = true;
    UI.micDistanceSlider.disabled = true;
    UI.inputMeter.style.width = '0%';
    UI.outputMeter.style.width = '0%';
}

function updateMicDistance() {
    const value = parseInt(UI.micDistanceSlider.value);
    const meters = value / 100; // cmをメートルに変換
    UI.micDistanceValue.textContent = `${value} cm`;

    if (processor) {
        processor.port.postMessage({
            command: 'setMicDistance',
            value: meters
        });
    }
}

function selectMethod(btn) {
    // 前のアクティブボタンを非アクティブにする
    UI.methodButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const methodMap = {
        'methodPassthrough': 'passthrough',
        'methodMidside': 'midside',
        'methodParacardioid': 'paracardioid',
        'methodTDOA': 'tdoa',
        'methodFrequency': 'frequency'
    };

    const method = methodMap[btn.id];

    if (processor) {
        processor.port.postMessage({
            command: 'setMethod',
            value: method
        });
    }

    updateParameterControls(method);
}

function updateParameterControls(method) {
    const controls = UI.parameterControls;
    controls.innerHTML = '';

    const methodParams = {
        'midside': [
            { name: 'midSideStrength', label: 'Side減衰強度', min: 0, max: 1, step: 0.1, default: 0.7 }
        ],
        'paracardioid': [
            { name: 'paracardioidStrength', label: '指向性強度', min: 0, max: 1, step: 0.1, default: 0.8 }
        ],
        'tdoa': [
            { name: 'tdoaDelay', label: '遅延調整', min: 0, max: 1, step: 0.1, default: 0.5 }
        ],
        'frequency': [
            { name: 'frequencyBands', label: 'バンド数', min: 2, max: 8, step: 1, default: 4 }
        ]
    };

    const params = methodParams[method] || [];

    if (params.length > 0) {
        UI.parameterSection.style.display = 'block';
        params.forEach(param => {
            const container = document.createElement('div');
            container.className = 'slider-container';
            container.innerHTML = `
                <label class="slider-label">${param.label}</label>
                <input type="range" min="${param.min}" max="${param.max}" step="${param.step}" value="${param.default}" class="param-slider" data-param="${param.name}">
                <span class="slider-value">${param.default.toFixed(1)}</span>
            `;
            controls.appendChild(container);

            const slider = container.querySelector('.param-slider');
            const value = container.querySelector('.slider-value');

            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                value.textContent = val.toFixed(1);

                if (processor) {
                    processor.port.postMessage({
                        command: `set${param.name.charAt(0).toUpperCase() + param.name.slice(1)}`,
                        value: val
                    });
                }
            });
        });
    } else {
        UI.parameterSection.style.display = 'none';
    }
}

async function enumerateOutputDevices() {
    console.log("enumerateOutputDevices start");
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            console.error('navigator.mediaDevices は利用不可');
            UI.sinkIdStatus.textContent = '⚠️ 出力デバイス選択は HTTPS/localhost でのみ利用可能';
            return;
        }
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        console.log('Devices:', devices);
        const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
        console.log('Audio outputs:', audioOutputs);
        UI.outputDeviceSelect.innerHTML = '<option value="">デフォルト</option>';
        audioOutputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Audio Output ${device.deviceId.substring(0, 5)}...`;
            UI.outputDeviceSelect.appendChild(option);
        });

        if (audioOutputs.length > 0) {
            UI.sinkIdStatus.textContent = `✓ ${audioOutputs.length} 個のデバイスが利用可能`;
        } else {
            UI.sinkIdStatus.textContent = 'ℹ️ 出力デバイスが見つかりません';
        }
    } catch (error) {
        console.error('Error enumerating devices:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        
        // file:// プロトコルでの SecurityError
        if (error.name === 'SecurityError') {
            UI.sinkIdStatus.textContent = '⚠️ HTTPS または localhost でご利用ください';
        } else {
            UI.sinkIdStatus.textContent = `エラー: ${error.message}`;
        }
    }
}

async function changeOutputDevice() {
    if (!audioContext) return;

    const deviceId = UI.outputDeviceSelect.value;
    
    try {
        if (typeof audioContext.setSinkId !== 'function') {
            UI.sinkIdStatus.textContent = '⚠️ setSinkId() がサポートされていません（HTTPS または localhost が必要です）';
            return;
        }

        await audioContext.setSinkId(deviceId);
        const displayName = deviceId === '' ? 'デフォルト' : UI.outputDeviceSelect.options[UI.outputDeviceSelect.selectedIndex].text;
        UI.sinkIdStatus.textContent = `✓ 出力デバイス: ${displayName}`;
    } catch (error) {
        console.error('Error setting sink ID:', error);
        UI.sinkIdStatus.textContent = `エラー: ${error.message}`;
        UI.outputDeviceSelect.value = '';
    }
}

function updateMeters() {
    if (!analyzerInput || !analyzerOutput) {
        requestAnimationFrame(updateMeters);
        return;
    }

    // 入力レベル計算
    const inputData = new Uint8Array(analyzerInput.frequencyBinCount);
    analyzerInput.getByteFrequencyData(inputData);
    const inputAvg = inputData.reduce((a, b) => a + b) / inputData.length;
    const inputPercent = (inputAvg / 255) * 100;
    const inputDB = 20 * Math.log10(inputAvg / 255 || 0.001);

    UI.inputMeter.style.width = Math.min(inputPercent, 100) + '%';
    UI.inputLevel.textContent = inputDB.toFixed(1) + ' dB';

    // 出力レベル計算
    const outputData = new Uint8Array(analyzerOutput.frequencyBinCount);
    analyzerOutput.getByteFrequencyData(outputData);
    const outputAvg = outputData.reduce((a, b) => a + b) / outputData.length;
    const outputPercent = (outputAvg / 255) * 100;
    const outputDB = 20 * Math.log10(outputAvg / 255 || 0.001);

    UI.outputMeter.style.width = Math.min(outputPercent, 100) + '%';
    UI.outputLevel.textContent = outputDB.toFixed(1) + ' dB';

    requestAnimationFrame(updateMeters);
}

// 初期化
updateStatus('待機中', false);
UI.micDistanceSlider.disabled = true;
