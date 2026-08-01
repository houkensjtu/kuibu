# kuibu（跬步）
 
> 名出「不积跬步，无以至千里」。CLI 命令名同为 `kuibu`。
 
一个个人用的读书打卡工具。项目由我负责构思设计，Claude Code 负责技术实现。

## 克隆后先做一件事

```
git config core.hooksPath .githooks
```

这条不会随 clone 自动生效（`core.hooksPath` 是本地配置，不进 git 历史），
但拦截私有内容包误推的 pre-commit 检查依赖它，务必先跑一遍。