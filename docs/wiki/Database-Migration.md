# 数据库迁移指南 (Database Migration Guide)

本项目使用 **Alembic** 进行数据库版本管理。为了简化操作，我们提供了一个封装脚本 `backend/manage_db.py`。

## 为什么需要数据库迁移？

在开发过程中，我们经常需要修改数据库模型（`models.py`），例如添加新表、新字段或修改字段类型。如果不使用迁移工具，我们可能需要手动修改数据库结构，这容易出错且难以在多人协作或不同环境（开发、测试、生产）中保持一致。

Alembic 允许我们将数据库的变更记录为版本文件（Migration Scripts），并自动应用这些变更。

## 快速开始

所有的数据库操作都应在 `backend` 目录下进行。

### 1. 初始化（仅首次需要）

项目已经初始化了 Alembic。如果你是新克隆的项目，通常不需要重新初始化。后端服务启动时会自动尝试应用所有未应用的迁移。

### 2. 修改模型

在 `backend/models.py` 中修改你的 SQLAlchemy 模型。例如，给 `Player` 表添加一个 `email` 字段：

```python
# backend/models.py
class Player(Base):
    # ...
    email = Column(String, nullable=True)
```

### 3. 生成迁移脚本

修改完模型后，运行以下命令生成迁移脚本：

```bash
cd backend
python manage_db.py migrate "add email to player"
```

*   `"add email to player"` 是对本次变更的描述，请务必清晰描述。
*   脚本会自动在 `backend/migrations/versions/` 目录下生成一个新的 `.py` 文件。
*   **注意**：生成后请务必检查生成的脚本文件，确保它正确反映了你的修改。Alembic 的自动检测（autogenerate）虽然强大，但并非完美（例如重命名列可能无法识别）。

### 4. 应用迁移

生成脚本后，你需要将其应用到数据库：

```bash
python manage_db.py upgrade
```

或者，直接重启后端服务（`python main.py`），系统在启动时会自动执行 `upgrade` 操作。

### 5. 回滚迁移（如果出错）

如果你发现刚才应用的迁移有问题，可以回滚到上一个版本：

```bash
python manage_db.py downgrade
```

这会撤销**最近一次**的迁移操作。

## 常用命令参考

| 命令 | 描述 |
| :--- | :--- |
| `python manage_db.py migrate "message"` | 检测模型变更并生成新的迁移脚本 |
| `python manage_db.py upgrade` | 将数据库升级到最新版本 |
| `python manage_db.py downgrade` | 将数据库回滚一个版本 |

## 常见问题

### "Target database is not up to date."
这意味着你的数据库落后于代码中的迁移版本。运行 `python manage_db.py upgrade` 即可。

### SQLite 限制
本项目默认使用 SQLite。SQLite 对 `ALTER TABLE` 的支持有限（例如不支持删除列、修改列约束等）。
Alembic 配置已开启 `render_as_batch=True` 模式，这会通过“创建新表-复制数据-删除旧表-重命名新表”的方式来模拟复杂的修改操作。但在某些复杂场景下（如自引用外键），仍可能遇到问题。建议尽量避免复杂的重构，或手动检查生成的迁移脚本。

### 多人协作冲突
如果多个人同时生成了迁移脚本，可能会导致版本链分叉（Multiple heads）。Alembic 会报错。
解决方法：
1.  手动修改其中一个迁移脚本的 `down_revision` 指向另一个迁移的 `revision` ID，将其串联起来。
2.  或者合并两个迁移脚本的内容。
