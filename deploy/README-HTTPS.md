# HTTPS 与反向代理模板

这个目录放的是可以直接复用的模板文件。

## 推荐方案

- Ubuntu: `deploy/caddy/Caddyfile`
- 传统反代: `deploy/nginx/xmao-remote.conf`
- systemd: `deploy/systemd/xmao-remote.service`
- Windows: `deploy/windows/Caddyfile` + `deploy/windows/start-with-caddy.bat`

## 使用方式

1. 先让仓库根目录下的 `server.js` 在 8080 端口正常运行
2. 把模板中的域名改成你自己的真实域名
3. 确保域名已经解析到服务器公网 IP
4. 启动反向代理后，设备端就可以直接填写 `https://你的域名`

## 设备端填写建议

- 直接公网端口: `http://你的公网IP:8080`
- 有反代和 HTTPS: `https://你的域名`
