/**
 * BeamformingProcessor - AudioWorklet プロセッサ
 * 4つの指向性強化アルゴリズムを実装
 */

class BeamformingProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    this.micDistance = 0.2; // デフォルト: 20cm (メートル)
    this.sampleRate = sampleRate;
    this.currentMethod = 'passthrough'; // 初期値: パススルー
    
    // 各手法のパラメータ
    this.midSideStrength = 0.7; // Mid/Side: side成分の減衰量 (0-1)
    this.paracardioidStrength = 0.8; // パラカーディオイド: 指向性強度 (0-1)
    this.tdoaDelay = 0; // TDOA: 遅延サンプル数
    this.frequencyBands = 4; // 周波数依存: バンド数
    
    // 前フレームのサンプル（TDOA用）
    this.prevLeftSample = 0;
    this.prevRightSample = 0;
    
    // メッセージリスナー
    this.port.onmessage = (event) => {
      const { command, value } = event.data;
      
      if (command === 'setMethod') {
        this.currentMethod = value;
      } else if (command === 'setMicDistance') {
        this.micDistance = value;
        this.updateTDOADelay();
      } else if (command === 'setMidSideStrength') {
        this.midSideStrength = value;
      } else if (command === 'setParacardioidStrength') {
        this.paracardioidStrength = value;
      }
    };
    
    this.updateTDOADelay();
  }
  
  // TDOA遅延を計算
  updateTDOADelay() {
    // 音速: 343 m/s
    const speedOfSound = 343;
    // 遅延時間 = マイク間隔 / 音速 (秒)
    const delayTime = this.micDistance / speedOfSound;
    // サンプル数に変換
    this.tdoaDelay = Math.round(delayTime * this.sampleRate);
  }
  
  // 1. Mid/Side ミックス法
  processMidSide(left, right) {
    // Mid = (L + R) / 2
    const mid = (left + right) / 2;
    // Side = (L - R) / 2
    const side = (left - right) / 2;
    
    // Side成分を減衰して、正面方向を強調
    const reducedSide = side * (1 - this.midSideStrength);
    
    // 逆変換
    const outLeft = (mid + reducedSide);
    const outRight = (mid - reducedSide);
    
    return [outLeft, outRight];
  }
  
  // 2. パラカーディオイド（指向性パターン合成）
  processParacardioid(left, right) {
    // パラカーディオイド = 指向性パターンの加重平均
    // 全指向性 (omnidirectional): (L+R)/2
    // 双指向性 (figure-8): (L-R)/2
    // 単一指向性 (cardioid): (L+R)/2 + α(L-R)/2
    
    const omni = (left + right) / 2;
    const figure8 = (left - right) / 2;
    
    // パラカーディオイドパターン（strength で調整）
    // strength=0: 全指向性, strength=1: 最大カーディオイド
    const cardioid = omni + figure8 * this.paracardioidStrength;
    
    // 出力（L, Rは同じ処理）
    return [cardioid, cardioid];
  }
  
  // 3. 時間差遅延ビームフォーミング（TDOA）
  processTDOA(left, right) {
    // Rチャンネルを遅延させる（正面から来た音は遅延後にL,Rが揃う）
    // 遅延バッファを使って実装（簡易版：前フレーム参照）
    
    let delayedRight;
    if (this.tdoaDelay > 0) {
      // 遅延は固定値を使用（実装簡略化）
      delayedRight = this.prevRightSample;
    } else {
      delayedRight = right;
    }
    
    // 遅延後のLとRを合成（相互相関が最大になるポイント）
    const output = (left + delayedRight) / 2;
    
    // 前フレーム値を保存
    this.prevLeftSample = left;
    this.prevRightSample = right;
    
    return [output, output];
  }
  
  // 4. 周波数依存ビームフォーミング（簡易版）
  processFrequencyDependent(left, right) {
    // 低周波: 全指向性（ビームフォーミング困難）
    // 高周波: カーディオイド（指向性強い）
    
    // 簡易実装: バンドパスフィルタなしで、周波数依存強度を適用
    const midSideOut = this.processMidSide(left, right);
    const paraOut = this.processParacardioid(left, right);
    
    // 低周波成分には mid/side を弱く、高周波成分にはパラカーディオイドを強く
    // （実装簡略化のため、重み付け合成）
    const weight = 0.4; // 周波数依存の比率
    const outLeft = midSideOut[0] * (1 - weight) + paraOut[0] * weight;
    const outRight = midSideOut[1] * (1 - weight) + paraOut[1] * weight;
    
    return [outLeft, outRight];
  }
  
  // メイン処理
  process(inputs, outputs, parameters) {
    const inputL = inputs[0];
    const inputR = inputs[0];
    const outputL = outputs[0];
    
    // 両チャンネル取得（ステレオ入力）
    const leftChannel = inputL[0];
    const rightChannel = inputR.length > 1 ? inputR[1] : inputL[0]; // フォールバック
    
    // 出力
    const outLeftChannel = outputL[0];
    
    if (!leftChannel || !rightChannel || !outLeftChannel) {
      return true;
    }
    
    // フレーム内の各サンプルを処理
    for (let i = 0; i < leftChannel.length; i++) {
      let processed;
      
      switch (this.currentMethod) {
        case 'midside':
          processed = this.processMidSide(leftChannel[i], rightChannel[i]);
          break;
        case 'paracardioid':
          processed = this.processParacardioid(leftChannel[i], rightChannel[i]);
          break;
        case 'tdoa':
          processed = this.processTDOA(leftChannel[i], rightChannel[i]);
          break;
        case 'frequency':
          processed = this.processFrequencyDependent(leftChannel[i], rightChannel[i]);
          break;
        case 'passthrough':
        default:
          // パススルー: L+R を平均
          processed = [(leftChannel[i] + rightChannel[i]) / 2, 0];
          break;
      }
      
      // 出力（モノラル）
      outLeftChannel[i] = Math.max(-1, Math.min(1, processed[0])); // クリッピング防止
    }
    
    return true;
  }
}

registerProcessor('beamforming-processor', BeamformingProcessor);
