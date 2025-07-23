import Vue from 'vue'
import Antd from 'ant-design-vue'

// reset css
import 'ant-design-vue/dist/antd.css'
import 'normalize.css'
import 'reset-css'

import App from './App.vue'
import router from './router'
import store from './store'

Vue.use(Antd)
Vue.config.productionTip = false

new Vue({
  router,
  store,
  render: (h) => h(App)
}).$mount('#app')
