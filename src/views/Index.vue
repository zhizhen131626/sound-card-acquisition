<template>
  <div class="audio-recorder">
    <h1>音频采集工具</h1>

    <div class="device-selector">
      <label for="audioSource">选择音频输入设备:</label>
      <select id="audioSource" v-model="selectedDeviceId">
        <option v-for="device in audioDevices" :key="device.deviceId" :value="device.deviceId">
          {{ device.label || `麦克风 ${audioDevices.indexOf(device) + 1}` }}
        </option>
      </select>
      <button @click="refreshDevices">刷新设备列表</button>
    </div>

    <div class="controls">
      <button @click="startRecording" :disabled="isRecording || !audioDevices.length">
        开始录音
      </button>
      <button @click="stopRecording" :disabled="!isRecording">停止录音</button>
      <button @click="downloadAudio" :disabled="!audioBlob">下载录音</button>
    </div>

    <div class="status" :class="{ recording: isRecording }">
      {{ statusMessage }}
    </div>

    <audio v-if="audioUrl" :src="audioUrl" controls></audio>
  </div>
</template>

<script>
export default {
  name: 'AudioRecorder',
  data() {
    return {
      audioDevices: [],
      selectedDeviceId: '',
      isRecording: false,
      statusMessage: '请加载音频设备',
      mediaStream: null,
      audioContext: null,
      mediaRecorder: null,
      audioChunks: [],
      audioBlob: null,
      audioUrl: ''
    }
  },
  async mounted() {
    await this.refreshDevices()
  },
  beforeDestroy() {
    this.cleanup()
  },
  methods: {
    async refreshDevices() {
      try {
        this.statusMessage = '正在加载音频设备...'

        // 必须先获取用户媒体权限才能枚举设备
        await navigator.mediaDevices.getUserMedia({ audio: true })

        const devices = await navigator.mediaDevices.enumerateDevices()
        this.audioDevices = devices.filter((device) => device.kind === 'audioinput')

        if (this.audioDevices.length > 0) {
          this.selectedDeviceId = this.audioDevices[0].deviceId
          this.statusMessage = '请选择音频设备并开始录音'
        } else {
          this.statusMessage = '未找到音频输入设备或未授予权限'
        }
      } catch (error) {
        console.error('Error enumerating audio devices:', error)
        this.statusMessage = `获取设备失败: ${error.message}`
        this.audioDevices = []
      }
    },

    async startRecording() {
      try {
        this.cleanup()
        this.statusMessage = '正在准备录音...'

        const constraints = {
          audio: {
            deviceId: this.selectedDeviceId ? { exact: this.selectedDeviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        }

        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints)

        // 创建音频上下文
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 48000
        })

        // 检测浏览器支持的MIME类型
        const options = { audioBitsPerSecond: 128000 }
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          options.mimeType = 'audio/webm;codecs=opus'
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          options.mimeType = 'audio/mp4;codecs=mp4a'
        } else {
          // 默认使用浏览器支持的格式
          console.warn('无法确定支持的录音格式，使用浏览器默认格式')
        }

        this.mediaRecorder = new MediaRecorder(this.mediaStream, options)

        this.audioChunks = []
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data)
          }
        }

        this.mediaRecorder.onstop = () => {
          // 根据实际格式设置正确的MIME类型
          let mimeType = 'audio/wav'
          if (options.mimeType) {
            const [mimeTypeWithoutParams] = mimeType.split(';')
            mimeType = mimeTypeWithoutParams
            // mimeType = options.mimeType.split(';')[0] // 移除codecs部分
          }
          this.audioBlob = new Blob(this.audioChunks, { type: mimeType })
          this.audioUrl = URL.createObjectURL(this.audioBlob)
          this.statusMessage = '录音完成，可以试听或下载'
        }

        this.mediaRecorder.start(100)
        this.isRecording = true
        this.statusMessage = '正在录音...'
      } catch (error) {
        console.error('Error starting recording:', error)
        this.statusMessage = `开始录音失败: ${error.message}`
        this.cleanup()
      }
    },

    stopRecording() {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop()
      }
      this.isRecording = false

      // 关闭音频流中的轨道
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop())
      }
    },

    downloadAudio() {
      if (!this.audioBlob) return

      // 根据实际格式设置文件扩展名
      let extension = 'wav'
      if (this.audioBlob.type.includes('webm')) {
        extension = 'webm'
      } else if (this.audioBlob.type.includes('mp4')) {
        extension = 'mp4'
      }

      const url = this.audioUrl
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = `recording_${new Date().toISOString().slice(0, 19)}.${extension}`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }, 100)
    },

    cleanup() {
      this.stopRecording()

      if (this.audioUrl) {
        URL.revokeObjectURL(this.audioUrl)
        this.audioUrl = ''
      }

      this.audioBlob = null
      this.audioChunks = []
      this.mediaRecorder = null
      this.mediaStream = null

      if (this.audioContext) {
        this.audioContext.close()
        this.audioContext = null
      }
    }
  }
}
</script>

<style scoped>
.audio-recorder {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

.device-selector,
.controls {
  margin: 20px 0;
}

select,
button {
  padding: 8px 12px;
  margin: 5px;
  font-size: 16px;
}

button {
  cursor: pointer;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.status {
  margin: 10px 0;
  font-weight: bold;
  padding: 10px;
  border-radius: 4px;
  background-color: #f5f5f5;
}

.status.recording {
  color: white;
  background-color: #f44336;
  animation: pulse 1.5s infinite;
}

audio {
  width: 100%;
  margin: 20px 0;
  display: block;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
  100% {
    opacity: 1;
  }
}
</style>
