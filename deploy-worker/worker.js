export default {
  async fetch(request, env) {
    let res = await env.ASSETS.fetch(request)
    if (res.status >= 400) {
      const url = new URL(request.url)
      const indexRequest = new Request(url.origin + "/index.html", request)
      res = await env.ASSETS.fetch(indexRequest)
    }
    return res
  },
}