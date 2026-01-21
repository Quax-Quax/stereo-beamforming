/**
 * ステレオマイク指向性強化アプリケーション
 * Web配信版メインスクリプト
 */

let audioContext = null;
let mediaStream = null;
let processor = null;
let sourceNode = null;
let splitterInput = null;
let splitterOutput = null;
let analyzerInputL = null;
let analyzerInputR = null;
let analyzerOutputL = null;
let analyzerOutputR = null;

const UI = {
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    statusText: document.getElementById('statusText'),
    statusIndicator: document.getElementById('statusIndicator'),
    errorBox: document.getElementById('errorBox'),
    micDistanceSlider: document.getElementById('micDistanceSlider'),
    micDistanceValue: document.getElementById('micDistanceValue'),
    methodButtons: document.querySelectorAll('.method-btn'),
    inputLMeter: document.getElementById('inputLMeter'),
    inputRMeter: document.getElementById('inputRMeter'),
    outputLMeter: document.getElementById('outputLMeter'),
    outputRMeter: document.getElementById('outputRMeter'),
    inputLLevel: document.getElementById('inputLLevel'),
    inputRLevel: document.getElementById('inputRLevel'),
    outputLLevel: document.getElementById('outputLLevel'),
    outputRLevel: document.getElementById('outputRLevel'),
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

        // ステレオスプリッター作成（入力用）
        splitterInput = audioContext.createChannelSplitter(2);
        
        // アナライザー作成（チャンネル別）
        analyzerInputL = audioContext.createAnalyser();
        analyzerInputL.fftSize = 2048;
        analyzerInputR = audioContext.createAnalyser();
        analyzerInputR.fftSize = 2048;
        analyzerOutputL = audioContext.createAnalyser();
        analyzerOutputL.fftSize = 2048;
        analyzerOutputR = audioContext.createAnalyser();
        analyzerOutputR.fftSize = 2048;

        // ノード接続（入力）
        sourceNode.connect(splitterInput);
        splitterInput.connect(analyzerInputL, 0);
        splitterInput.connect(analyzerInputR, 1);
        sourceNode.connect(processor);

        // 出力用スプリッター作成
        splitterOutput = audioContext.createChannelSplitter(2);
        processor.connect(splitterOutput);
        splitterOutput.connect(analyzerOutputL, 0);
        splitterOutput.connect(analyzerOutputR, 1);
        processor.connect(audioContext.destination);
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
    splitterInput = null;
    splitterOutput = null;
    analyzerInputL = null;
    analyzerInputR = null;
    analyzerOutputL = null;
    analyzerOutputR = null;

    updateStatus('停止', false);
    UI.startBtn.disabled = false;
    UI.stopBtn.disabled = true;
    UI.micDistanceSlider.disabled = true;
    UI.inputLMeter.style.width = '0%';
    UI.inputRMeter.style.width = '0%';
    UI.outputLMeter.style.width = '0%';
    UI.outputRMeter.style.width = '0%';
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
    const isWebKit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    if (isWebKit) {
        // WebKit/Safari - AirPlay対応
        console.log('WebKit detected, using AirPlay selector');
        setupAirPlaySelector();
        return;
    }
    
    // 標準的なsetSinkId方式（Chrome, Firefox等）
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

function setupAirPlaySelector() {
    // AirPlayボタン用のダミーオーディオ要素を作成（WebKit/Safari）
    const audioElement = document.createElement('audio');
    audioElement.style.display = 'none';
    document.body.appendChild(audioElement);
    
    // webkitShowPlaybackTargetPicker() で AirPlay ピッカーを表示
    if (typeof audioElement.webkitShowPlaybackTargetPicker === 'function') {
        UI.outputDeviceSelect.innerHTML = '';
        
        const button = document.createElement('button');
        button.textContent = 'AirPlayデバイスを選択';
        button.style.width = '100%';
        button.style.padding = '10px';
        button.style.marginTop = '10px';
        button.className = 'control-button';
        button.addEventListener('click', () => {
            audioElement.webkitShowPlaybackTargetPicker();
        });
        
        UI.outputDeviceSelect.replaceWith(button);
        UI.sinkIdStatus.textContent = 'AirPlay対応ブラウザ';
        
        // AirPlayイベントリスナー設定
        audioElement.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => {
            console.log('AirPlay availability changed:', e);
            if (e.availability === 'available') {
                UI.sinkIdStatus.textContent = '✓ AirPlayデバイスが利用可能です';
            } else if (e.availability === 'unavailable') {
                UI.sinkIdStatus.textContent = 'AirPlayデバイスが利用できません';
            }
        });
        
        audioElement.addEventListener('webkitcurrentplaybacktargetischanged', (e) => {
            console.log('AirPlay target changed:', e);
            UI.sinkIdStatus.textContent = '出力デバイスを切り替えました';
        });
    } else {
        UI.sinkIdStatus.textContent = 'AirPlayがサポートされていません';
    }
}

async function changeOutputDevice() {
    if (!audioContext) return;

    const deviceId = UI.outputDeviceSelect.value;
    const isWebKit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    // WebKitの場合はAirPlayピッカーで処理されるため、ここでは何もしない
    if (isWebKit) {
        return;
    }
    
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
    if (!analyzerInputL || !analyzerInputR || !analyzerOutputL || !analyzerOutputR) {
        requestAnimationFrame(updateMeters);
        return;
    }

    // 入力Lチャンネル計算
    const inputLData = new Uint8Array(analyzerInputL.frequencyBinCount);
    analyzerInputL.getByteFrequencyData(inputLData);
    const inputLAvg = inputLData.reduce((a, b) => a + b) / inputLData.length;
    const inputLPercent = (inputLAvg / 255) * 100;
    const inputLDB = 20 * Math.log10(inputLAvg / 255 || 0.001);

    UI.inputLMeter.style.width = Math.min(inputLPercent, 100) + '%';
    UI.inputLLevel.textContent = inputLDB.toFixed(1) + ' dB';

    // 入力Rチャンネル計算
    const inputRData = new Uint8Array(analyzerInputR.frequencyBinCount);
    analyzerInputR.getByteFrequencyData(inputRData);
    const inputRAvg = inputRData.reduce((a, b) => a + b) / inputRData.length;
    const inputRPercent = (inputRAvg / 255) * 100;
    const inputRDB = 20 * Math.log10(inputRAvg / 255 || 0.001);

    UI.inputRMeter.style.width = Math.min(inputRPercent, 100) + '%';
    UI.inputRLevel.textContent = inputRDB.toFixed(1) + ' dB';

    // 出力Lチャンネル計算
    const outputLData = new Uint8Array(analyzerOutputL.frequencyBinCount);
    analyzerOutputL.getByteFrequencyData(outputLData);
    const outputLAvg = outputLData.reduce((a, b) => a + b) / outputLData.length;
    const outputLPercent = (outputLAvg / 255) * 100;
    const outputLDB = 20 * Math.log10(outputLAvg / 255 || 0.001);

    UI.outputLMeter.style.width = Math.min(outputLPercent, 100) + '%';
    UI.outputLLevel.textContent = outputLDB.toFixed(1) + ' dB';

    // 出力Rチャンネル計算
    const outputRData = new Uint8Array(analyzerOutputR.frequencyBinCount);
    analyzerOutputR.getByteFrequencyData(outputRData);
    const outputRAvg = outputRData.reduce((a, b) => a + b) / outputRData.length;
    const outputRPercent = (outputRAvg / 255) * 100;
    const outputRDB = 20 * Math.log10(outputRAvg / 255 || 0.001);

    UI.outputRMeter.style.width = Math.min(outputRPercent, 100) + '%';
    UI.outputRLevel.textContent = outputRDB.toFixed(1) + ' dB';

    requestAnimationFrame(updateMeters);
}

// 初期化
updateStatus('待機中', false);
UI.micDistanceSlider.disabled = true;
