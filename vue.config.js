const isProduction = process.env.NODE_ENV === 'production'

module.exports = {
  runtimeCompiler: true,
  publicPath: isProduction ? '' : './',
  productionSourceMap: !isProduction,
  devServer: {
    proxy: {
      '/api': {
        target: '<proxyURL>',
        ws: true,
        changeOrigin: true,
        pathRewrite: {
          '^/api': ''
        }
      }
    }
  },
  chainWebpack: (config) => {
    config.plugin('html').tap((args) => {
      args[0].title = '项目 title'
      return args
    })
  }
}
