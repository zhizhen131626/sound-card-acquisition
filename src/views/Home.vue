<template>
  <div class="home">
    <h1>系统声卡选择与采集</h1>
    <div class="select-device">
      选择音频设备:
      <a-select v-model="deviceId">
        <a-select-option v-for="(item, index) in deviceList" :value="item.deviceId" :key="index">
          {{ item.label }}
        </a-select-option>
      </a-select>
    </div>
    <a-button type="primary" @click="handleStart" :disabled="!deviceId || isCapturing"
      >开始采集</a-button
    >
    <a-button type="danger" @click="handleStop" :disabled="!deviceId || !isCapturing"
      >停止采集</a-button
    >
    <a-button @click="startRecording" :disabled="!isCapturing || isRecording">开始录制</a-button>
    <a-button @click="stopRecording" :disabled="!isRecording">停止录制</a-button>

    <a-button @click="downloadAudio" :disabled="!recordedBlob">下载音频</a-button>
    <div v-if="recordedBlob" class="audio-preview">
      <h4>录制预览 ({{ formatDuration(audioDuration) }})</h4>
      <audio ref="audioPreview" controls :src="recordedAudioUrl"></audio>
    </div>
    <canvas id="audioVisualizer" ref="audioVisualizer"></canvas>

    <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
    <div v-if="recordingStatus" class="recording-status">{{ recordingStatus }}</div>
  </div>
</template>

<script>
export default {
  name: 'Home',
  components: {},
  data() {
    return {
      deviceId: null,
      deviceList: [],
      currentStream: null,
      audioContext: null,
      visualizationFrameId: null,
      analyserNode: null,
      isCapturing: false,
      isRecording: false,
      recordingStatus: '',
      mediaRecorder: null,
      recordedChunks: [],
      recordedBlob: null,
      errorMessage: '',
      audioDuration: 0
    }
  },
  mounted() {
    this.initAudioDevices()
    // 枚举所有音频输出设备（包括系统音频）
    // navigator.mediaDevices.enumerateDevices().then((devices) => {
    //   // 筛选音频输出设备（可能包含系统音频）
    //   const audioDevices = devices.filter((device) => device.kind === 'audiooutput')
    //   console.log('可用音频设备', audioDevices)
    // })
    // 监听设备变化事件
    navigator.mediaDevices.addEventListener('devicechange', this.initAudioDevices())
  },
  beforeDestroy() {
    this.stopRecording()
    // 组件销毁前停止采集并释放资源
    this.handleStop()

    // 移除事件监听
    navigator.mediaDevices.removeEventListener('devicechange', this.initAudioDevices())
  },
  watch: {
    deviceId: {
      handler() {
        if (this.deviceId) this.initAudioDevices()
      },
      immediate: true,
      deep: true
    }
  },
  computed: {
    // 创建可用于 <audio> 标签的 URL
    recordedAudioUrl() {
      return this.recordedBlob ? URL.createObjectURL(this.recordedBlob) : ''
    }
  },
  methods: {
    // 初始化：获取并显示可用音频设备
    async initAudioDevices() {
      try {
        // 先请求一次媒体权限（部分浏览器需要权限才能枚举设备）
        await navigator.mediaDevices.getUserMedia({ audio: true })
        // 枚举所有媒体设备
        const devices = await navigator.mediaDevices.enumerateDevices()
        // 筛选音频输入设备（麦克风和系统音频捕获设备）
        this.deviceList = devices.filter((device) => device.kind === 'audioinput')
        console.log('可用音频输入设备:', this.deviceList)
      } catch (err) {
        console.error('获取设备列表失败:', err)
      }
    },
    // 开始采集
    async handleStart() {
      try {
        // 关闭现有流和上下文
        this.handleStop()

        // 创建新的音频上下文
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()

        // 使用选定的设备 ID 获取音频流
        const constraints = {
          audio: {
            deviceId: { exact: this.deviceId }
          }
        }

        this.currentStream = await navigator.mediaDevices.getUserMedia(constraints)

        // 创建音频源节点
        const sourceNode = this.audioContext.createMediaStreamSource(this.currentStream)

        // 创建分析器节点（用于可视化）
        this.analyserNode = this.audioContext.createAnalyser()
        this.analyserNode.fftSize = 2048

        // 连接节点：源 → 分析器 → 扬声器（可选）
        sourceNode.connect(this.analyserNode)
        this.analyserNode.connect(this.audioContext.destination)

        // 开始可视化音频
        this.visualizeAudio()
        this.isCapturing = true
        console.log(
          `已连接到设备: ${
            this.deviceList.filter((item) => item.deviceId === this.deviceId)[0].label
          }`
        )
      } catch (err) {
        console.error('启动音频捕获失败:', err)
      }
    },
    // 停止采集
    handleStop() {
      if (this.currentStream) {
        this.currentStream.getTracks().forEach((track) => track.stop())
        this.currentStream = null
      }

      if (this.audioContext) {
        this.audioContext.close()
        this.audioContext = null
      }

      // 停止可视化
      if (this.visualizationFrameId) {
        this.cancelAnimationFrame(this.visualizationFrameId)
        this.visualizationFrameId = null
      }
      this.isCapturing = false
    },
    // 音频可视化（使用 Canvas 绘制波形）
    visualizeAudio() {
      const canvas = this.$refs.audioVisualizer
      if (!this.analyserNode || !canvas) return

      const canvasCtx = canvas.getContext('2d')
      const WIDTH = canvas.width
      const HEIGHT = canvas.height

      // 创建存储音频数据的数组
      const dataArray = new Uint8Array(this.analyserNode.fftSize)

      // 绘制函数
      const draw = () => {
        this.visualizationFrameId = requestAnimationFrame(draw)

        // 获取时域数据
        this.analyserNode.getByteTimeDomainData(dataArray)

        // 清空画布
        canvasCtx.fillStyle = 'rgb(20, 20, 20)'
        canvasCtx.fillRect(0, 0, WIDTH, HEIGHT)

        // 绘制波形
        canvasCtx.lineWidth = 2
        canvasCtx.strokeStyle = 'rgb(0, 255, 0)'
        canvasCtx.beginPath()

        const sliceWidth = (WIDTH * 1.0) / this.analyserNode.fftSize
        let x = 0

        for (let i = 0; i < this.analyserNode.fftSize; i += 1) {
          const v = dataArray[i] / 128.0
          const y = (v * HEIGHT) / 2

          if (i === 0) {
            canvasCtx.moveTo(x, y)
          } else {
            canvasCtx.lineTo(x, y)
          }

          x += sliceWidth
        }

        canvasCtx.lineTo(canvas.width, canvas.height / 2)
        canvasCtx.stroke()
      }

      // 开始绘制
      draw()
    },
    cancelAnimationFrame() {},
    // 开始录制音频
    startRecording() {
      if (!this.currentStream) {
        this.errorMessage = '请先开始音频采集'
        return
      }

      try {
        const mimeType = this.getSupportedMimeType()
        console.log('使用 MIME 类型:', mimeType)
        // 创建 MediaRecorder 实例
        // this.mediaRecorder = new MediaRecorder(this.currentStream)
        this.mediaRecorder = new MediaRecorder(this.currentStream, {
          mimeType,
          audioBitsPerSecond: 128000
        })

        this.recordedChunks = []

        // 监听数据可用事件
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data)
          }
        }

        // 监听录制停止事件
        this.mediaRecorder.onstop = () => {
          // 合并所有录制的片段
          this.recordedBlob = new Blob(this.recordedChunks, { type: mimeType })
          this.isRecording = false
          this.recordingStatus = '录制已完成'

          // 自动解析音频时长
          this.getAudioDuration()
        }

        // 开始录制
        this.mediaRecorder.start()
        this.isRecording = true
        this.recordingStatus = '正在录制...'
        this.errorMessage = ''

        console.log('开始录制音频')
      } catch (err) {
        this.errorMessage = `启动录制失败: ${err.message}`
        console.error('启动录制失败:', err)
      }
    },

    // 停止录制音频
    stopRecording() {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop()
        console.log('停止录制音频')
      }
    },

    // 下载录制的音频
    downloadAudio() {
      if (!this.recordedBlob) {
        this.errorMessage = '没有可下载的音频'
        return
      }

      // try {
      //   // 创建下载链接
      //   const url = URL.createObjectURL(this.recordedBlob)
      //   const a = document.createElement('a')
      //   a.href = url
      //   a.download = `audio-recording-${new Date().toISOString().replace(/:/g, '-')}.webm`

      //   // 模拟点击下载
      //   document.body.appendChild(a)
      //   a.click()

      //   // 清理资源
      //   setTimeout(() => {
      //     document.body.removeChild(a)
      //     URL.revokeObjectURL(url)
      //   }, 1000)

      //   this.errorMessage = ''
      //   console.log('音频下载已触发')
      // } catch (err) {
      //   this.errorMessage = `下载音频失败: ${err.message}`
      //   console.error('下载音频失败:', err)
      // }
      const audioContext = new AudioContext()
      const audioUrl = URL.createObjectURL(this.recordedBlob)
      fetch(audioUrl)
        .then((res) => res.arrayBuffer())
        .then((buffer) => audioContext.decodeAudioData(buffer))
        .then((audioBuffer) => {
          const source = audioContext.createBufferSource()
          source.buffer = audioBuffer

          // 1. 提升增益（音量）
          const gainNode = audioContext.createGain()
          gainNode.gain.value = 1.5 // 适度放大（避免超过1.0爆音）

          // 2. 简单降噪（过滤低频噪音）
          const filter = audioContext.createBiquadFilter()
          filter.type = 'highpass' // 高通滤波，过滤200Hz以下噪音
          filter.frequency.value = 200

          // 连接节点并播放
          source.connect(filter)
          filter.connect(gainNode)
          gainNode.connect(audioContext.destination)
          source.start(0)
        })
    },
    getSupportedMimeType() {
      const possibleTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/wav'
      ]

      return possibleTypes.find((type) => MediaRecorder.isTypeSupported(type)) || 'audio/webm'
    },
    getAudioDuration() {
      if (!this.recordedBlob) return

      const audioUrl = URL.createObjectURL(this.recordedBlob)
      const audio = new Audio(audioUrl)
      console.log('getAudio=========', this.recordedBlob, audioUrl, audio)

      // 监听元数据加载完成事件（关键）
      audio.addEventListener('loadedmetadata', () => {
        // 验证时长是否有效
        if (Number.isFinite(audio.duration) && !Number.isNaN(audio.duration)) {
          this.audioDuration = audio.duration
          console.log('正确获取时长:', this.formatDuration(audio.duration))
        } else {
          this.handleInvalidDuration() // 处理无效时长
        }
        // 释放临时资源
        URL.revokeObjectURL(audioUrl)
      })

      // 监听加载失败事件
      audio.addEventListener('error', (err) => {
        console.error('音频加载失败:', err)
        this.handleInvalidDuration()
        URL.revokeObjectURL(audioUrl) // 释放资源
      })
    },
    // 处理无效时长
    handleInvalidDuration() {
      this.errorMessage = '无法获取音频时长，可能是格式不支持'
      // 方案1：使用录制时间作为参考（需记录开始/结束时间）
      // if (this.recordingStartTime && this.recordingEndTime) {
      //   const duration = (this.recordingEndTime - this.recordingStartTime) / 1000
      //   this.audioDuration = duration
      //   console.log('使用录制时间估算时长:', duration)
      // } else {
      // 方案2：显示默认值
      this.audioDuration = 0
      // }
    },
    formatDuration(seconds) {
      if (!seconds) return '00:00'

      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = Math.floor(seconds % 60)

      return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
        .toString()
        .padStart(2, '0')}`
    }
  }
}
</script>

<style lang="less" scoped>
.home {
  padding: 100px;
  .ant-select {
    width: 300px;
  }
  .select-device {
    margin: 20px 0;
  }
  #audioVisualizer {
    border: 1px solid #ccc;
    display: block;
    margin-top: 20px;
    width: 100%;
    height: 200px;
  }
  .audio-preview {
    margin-top: 20px;
  }
}
</style>
