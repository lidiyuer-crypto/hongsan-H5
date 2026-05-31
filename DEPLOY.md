# 找兄弟(红三) H5 — NAS 部署指南

## 前提条件

- **NAS 已安装 Docker**（飞牛: 应用中心 → Docker；Synology: 套件中心 → Docker；QNAP: App Center → Container Station）
- **NAS 有公网 IP** 或已配置内网穿透（如 Cloudflare Tunnel、frp）
- **路由器可做端口转发**（如需外网访问）
- 本地开发机已安装 Git（拉代码用）

## 架构一览

```
互联网用户 ──→ 你的域名:8080/8443 ──→ 路由器端口转发 ──→ NAS IP
                                                      │
                                              ┌───────┴────────┐
                                              │  Docker Compose │
                                              │                 │
                                              │  nginx (80/443) │──→ 静态文件 (前端)
                                              │    │            │
                                              │    └────────────│──→ server:3001 (Bun API/WS)
                                              │                 │
                                              │  server (3001)  │──→ SQLite (/app/data)
                                              └─────────────────┘
```
> 飞牛/群晖管理界面默认占用 80/443，所以容器暴露 8080/8443。详见下方"飞牛 OS 特别说明"。

## 分支策略

```
main   — 生产稳定分支 (NAS 运行此分支)
master — 开发分支 (新功能先在此验证)
```

**工作流**: 本地开发 → push `master` → NAS pull `master` → 验收通过 → merge 到 `main` → NAS 切换到 `main`

```bash
# 本地开发
git checkout master
# ... 写代码 ...
git commit -m "feat: xxx"
git push origin master

# NAS 拉取测试
ssh nas
cd /vol1/docker/hongsan
git checkout master
git pull
sudo docker compose build && sudo docker compose up -d
# ... 测试验证 ...

# 验收通过 → 合并到 main
git checkout main
git merge master
git push origin main

# NAS 切换到稳定版
ssh nas
cd /vol1/docker/hongsan
git checkout main
git pull
sudo docker compose build && sudo docker compose up -d
```

## 快速开始（首次部署）

```bash
# 1. 在 GitHub 创建私有仓库，然后克隆到 NAS
ssh your-nas-user@nas-ip
mkdir -p /vol1/docker
cd /vol1/docker
git clone https://github.com/你的用户名/红三-H5.git hongsan
cd hongsan
git checkout main   # 使用稳定分支

# 2. 设置 JWT 密钥和管理员密钥
cp server/.env.example server/.env
# 编辑 server/.env，修改 JWT_SECRET 和 ADMIN_KEY

# 3. 启动
sudo docker compose up -d
```

打开 `http://你的NAS-IP:8080` 就能玩了。
管理后台: `http://你的NAS-IP:8080/admin?key=你的ADMIN_KEY`

---

## 详细步骤

### 第一步：把代码弄到 NAS 上

**方式 A：Git 克隆（推荐）**
```bash
# SSH 进 NAS
ssh root@nas-ip

# 克隆仓库（用你的 GitHub 仓库地址替换）
cd /vol1/docker/
git clone https://github.com/你的用户名/红三-H5.git hongsan
cd hongsan
git checkout main   # 稳定分支
```

**方式 B：直接拷贝**
```bash
# 在开发机上
scp -r ./红三-H5 admin@nas-ip:/volume1/docker/hongsan/
```

### 第二步：配置环境变量

```bash
cd /volume1/docker/hongsan/

# 复制模板
cp server/.env.example server/.env

# 生成随机 JWT 密钥
echo "JWT_SECRET=$(openssl rand -base64 32)" >> server/.env

# 编辑确认
nano server/.env
```

`.env` 文件内容：
```ini
PORT=3001
JWT_SECRET=至少32位随机字符串-务必修改
DB_PATH=/app/data/hongsan.db
```

### 第三步：构建并启动

```bash
# 在项目根目录（docker-compose.yml 所在目录）
docker compose up -d

# 查看启动日志
docker compose logs -f

# 看到以下输出表示成功：
# hongsan-server  | 🚀 Server running on http://localhost:3001
# hongsan-server  | 📡 WebSocket: ws://localhost:3001/ws
```

启动后：
- 前端页面：`http://你的NAS-IP:8080`
- 健康检查：`http://你的NAS-IP:8080/api/health` → `{"ok":true}`
- WebSocket：`ws://你的NAS-IP:8080/ws`

### 第四步：端口转发（外网访问）

在路由器管理页面添加端口转发：

| 名称 | 外部端口 | 内部IP | 内部端口 | 协议 |
|------|---------|--------|---------|------|
| 红三-HTTP | 8080 | NAS-IP | 8080 | TCP |
| 红三-HTTPS | 8443 | NAS-IP | 8443 | TCP |

> 外部端口可以自选。比如朋友访问 `http://你的公网IP:5555`，就把外部端口填 5555，内部仍映射到 NAS 的 8080。

### 第五步：（可选）域名 + SSL

如果已有域名（如 `game.yourdomain.com`）：

**方案 A：Cloudflare Tunnel（最简单，无需公网IP）**
```bash
# 在 NAS 上安装 cloudflared
# 创建 tunnel → 指向 http://nginx:80
# Cloudflare 自动提供 SSL，无需自己搞证书
docker run -d \
  --name cloudflare-tunnel \
  --network hongsan_hongsan \
  cloudflare/cloudflared:latest \
  tunnel --url http://nginx:80
```

**方案 B：Let's Encrypt + Certbot（传统方式）**
```bash
# 用 Certbot 获取免费 SSL 证书
# 然后把证书放到 ./ssl/ 目录
# 编辑 nginx.conf，取消 HTTPS server 块的注释
# 重启 nginx: docker compose restart nginx
```

**方案 C：自签名证书（内网够用）**
```bash
mkdir -p ssl
openssl req -x509 -nodes -days 3650 \
  -newkey rsa:2048 \
  -keyout ssl/privkey.pem \
  -out ssl/fullchain.pem \
  -subj "/CN=your-nas-ip"
# 然后取消 nginx.conf 中 HTTPS 部分的注释，重启
```

---

## 常用命令

```bash
# ===== 启动/停止 =====
docker compose up -d          # 后台启动
docker compose down           # 停止并删除容器
docker compose restart        # 重启所有服务

# ===== 查看状态 =====
docker compose ps             # 容器状态
docker compose logs -f        # 实时日志（Ctrl+C 退出）
docker compose logs server    # 只看服务器日志

# ===== 更新 =====
git pull                      # 拉最新代码
docker compose build          # 重新构建镜像
docker compose up -d          # 重启

# ===== 数据库 =====
# SQLite 数据库文件在 server/data/hongsan.db
# 备份：
cp server/data/hongsan.db server/data/hongsan.db.bak.$(date +%Y%m%d)

# ===== 完全清理 =====
docker compose down -v        # 删除容器+网络（保留数据库文件）
```

---

## 目录结构（NAS 上）

```
/volume1/docker/hongsan/
├── docker-compose.yml       # 容器编排
├── Dockerfile.nginx         # 前端构建 + Nginx
├── nginx.conf               # Nginx 配置
├── ssl/                     # SSL 证书 (可选)
│   ├── fullchain.pem
│   └── privkey.pem
├── server/
│   ├── Dockerfile           # Bun 服务器
│   ├── data/                # SQLite 数据库 (持久化)
│   │   └── hongsan.db
│   ├── .env                 # 环境变量 (不上传git)
│   └── ...
└── DEPLOY.md
```

---

## 排错

### 容器起不来

```bash
# 看完整日志
docker compose logs --tail=100

# 常见原因：
# 1. 端口冲突 → 修改 docker-compose.yml 的 ports 映射
# 2. 权限问题 → chmod 755 server/data/
```

### 能打开页面但连不上服务器

检查浏览器控制台 Network 标签：
- `/api/health` 请求是否成功？
- WebSocket 连接是否 `101 Switching Protocols`？

```bash
# 测试 API
curl http://localhost/api/health

# 检查 nginx 是否正确代理
docker compose exec nginx cat /etc/nginx/conf.d/default.conf
```

### 数据库损坏

```bash
# 备份当前数据库
cp server/data/hongsan.db server/data/hongsan.db.corrupt

# 删除并重建（用户需要重新注册）
rm server/data/hongsan.db
docker compose restart server
```

### 端口被占用

```bash
# 查看谁占用了 80/443
sudo netstat -tlnp | grep -E ':80|:443'

# 修改 docker-compose.yml，映射到其他端口：
#   ports:
#     - "8080:80"
#     - "8443:443"
```

---

## 日常更新（NAS 拉取部署）

### 测试新功能（master 分支）

```bash
# 1. SSH 进 NAS
ssh root@nas-ip

# 2. 进入项目目录
cd /vol1/docker/hongsan

# 3. 切到开发分支并拉取
git checkout master
git pull

# 4. 重新构建并重启
sudo docker compose build
sudo docker compose up -d

# 5. 看日志确认
sudo docker compose logs -f --tail=20
```

### 验收通过后上线（切换到 main）

```bash
# 1. 本地合并到 main
git checkout main
git merge master
git push origin main

# 2. NAS 切换到稳定版
ssh root@nas-ip
cd /vol1/docker/hongsan
git checkout main
git pull
sudo docker compose build && sudo docker compose up -d
```

### 紧急回滚

```bash
# NAS 上回滚到上一个稳定版本
cd /vol1/docker/hongsan
git checkout main
git pull
sudo docker compose build && sudo docker compose up -d
```

### 数据库迁移

```bash
# 如果代码更新包含数据库 schema 变化
sudo docker compose exec server bun run src/db/migrate.ts
```

---

## 飞牛 OS (FN OS) 特别说明

飞牛 OS 基于 Debian，Docker 原生支持，是部署最友好的 NAS 系统之一。

### 1. 前提确认

```bash
# SSH 登录（默认端口 22）
ssh root@nas-ip

# 确认 Docker 已安装
docker --version
docker compose version

# 如果没装 Docker（极少情况）：
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
```

### 2. 存储路径

飞牛默认存储池路径取决于创建时的命名：
- 常见：`/vol1/`、`/vol2/`
- 或直接 `/mnt/storage/`

```bash
# 查看存储池
ls /vol*   # 或 df -h
```

建议在存储池下创建 docker 目录：
```bash
mkdir -p /vol1/docker
```

### 3. 端口冲突解决

飞牛管理界面默认占用 **80** 和 **443** 端口。docker-compose.yml 已预设为 **8080:80** 和 **8443:443**。

**方案 A：用非标准端口（当前默认，最简单）**
- 内网访问：`http://NAS-IP:8080`
- 路由器转发 8080/8443 即可外网访问

**方案 B：释放 80/443（如果你想用标准端口）**
```bash
# 查看飞牛 Nginx 配置
cat /etc/nginx/conf.d/fnos.conf

# 把飞牛管理界面改到其他端口（如 8888）
sudo sed -i 's/listen 80/listen 8888/' /etc/nginx/conf.d/fnos.conf
sudo sed -i 's/listen 443/listen 8443/' /etc/nginx/conf.d/fnos.conf
sudo nginx -s reload

# 然后在 docker-compose.yml 里改回 "80:80" 和 "443:443"
```

**方案 C：飞牛自带 Nginx 反代（推荐生产环境）**
```bash
# 编辑 /etc/nginx/conf.d/hongsan.conf
sudo nano /etc/nginx/conf.d/hongsan.conf
```

```nginx
# 将 hongsan 通过子路径或子域名接入飞牛 Nginx
server {
    listen 80;
    server_name game.yourdomain.com;  # 或直接用 NAS IP

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

```bash
sudo nginx -t && sudo nginx -s reload
# 再把 docker-compose.yml 的 ports 映射去掉，让 nginx 容器只暴露给宿主机 localhost
```

### 4. Docker Compose 部署

```bash
# 进项目目录
cd /vol1/docker/hongsan

# 生成 JWT 密钥
cp server/.env.example server/.env
sed -i "s/change-this-to-a-random-secret/$(openssl rand -base64 32)/" server/.env

# 构建并启动
docker compose up -d

# 确认两个容器都在跑
docker compose ps
# 预期输出: hongsan-server (Up) + hongsan-nginx (Up)
```

### 5. 飞牛 Docker 管理 UI

飞牛的应用中心 → Docker → 容器列表，可以看到 `hongsan-server` 和 `hongsan-nginx`，支持图形化启停、日志查看。

### 6. 文件权限

飞牛创建的文件默认是 root 所有。如果遇到 SQLite 写入权限问题：
```bash
chmod -R 755 /vol1/docker/hongsan/server/data
# 或修改 docker-compose.yml 添加 user: "1000:1000"
```

---

## 安全建议

1. **务必修改 JWT_SECRET**：`openssl rand -base64 32`
2. **配置 SSL**：生产环境必须 HTTPS，否则密码明文传输
3. **定期备份数据库**：`server/data/hongsan.db` 是唯一的持久化数据
4. **限制 IP 访问**：如果只有固定朋友玩，可以在路由器设置 IP 白名单
5. **Cloudflare 保护**：套一层 Cloudflare → 隐藏真实 IP + DDoS 防护 + 免费 SSL
