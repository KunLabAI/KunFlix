import uuid
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from models import Theater, TheaterNode, TheaterEdge, generate_uuid
from schemas import (
    TheaterCreate, TheaterUpdate, TheaterSaveRequest,
    TheaterNodeCreate, TheaterEdgeCreate,
)


class TheaterService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_theater(self, user_id: str, data: TheaterCreate) -> Theater:
        theater = Theater(
            user_id=user_id,
            title=data.title,
            description=data.description,
            thumbnail_url=data.thumbnail_url,
            status=data.status,
            canvas_viewport=data.canvas_viewport,
            settings=data.settings,
            node_count=0,
        )
        self.db.add(theater)
        await self.db.commit()
        await self.db.refresh(theater)
        return theater

    async def _get_owned_theater(self, theater_id: str, user_id: str) -> Theater:
        """获取归属于指定用户的剧场，不存在或不属于该用户则抛 404"""
        result = await self.db.execute(
            select(Theater).where(Theater.id == theater_id, Theater.user_id == user_id)
        )
        theater = result.scalar_one_or_none()
        if theater is None:
            raise HTTPException(status_code=404, detail="Theater not found")
        return theater

    async def get_theater(self, theater_id: str, user_id: str) -> Theater:
        return await self._get_owned_theater(theater_id, user_id)

    async def get_theater_detail(self, theater_id: str, user_id: str) -> dict:
        theater = await self._get_owned_theater(theater_id, user_id)

        nodes_result = await self.db.execute(
            select(TheaterNode).where(TheaterNode.theater_id == theater_id)
        )
        edges_result = await self.db.execute(
            select(TheaterEdge).where(TheaterEdge.theater_id == theater_id)
        )

        return {
            "theater": theater,
            "nodes": list(nodes_result.scalars().all()),
            "edges": list(edges_result.scalars().all()),
        }

    async def list_user_theaters(
        self, user_id: str, page: int = 1, page_size: int = 20, status: str | None = None
    ) -> dict:
        query = select(Theater).where(Theater.user_id == user_id)
        count_query = select(func.count()).select_from(Theater).where(Theater.user_id == user_id)

        # 按 status 筛选（使用映射避免 if）
        filter_map = {
            None: lambda q: q,
            "draft": lambda q: q.where(Theater.status == "draft"),
            "published": lambda q: q.where(Theater.status == "published"),
            "archived": lambda q: q.where(Theater.status == "archived"),
        }
        apply_filter = filter_map.get(status, filter_map[None])
        query = apply_filter(query)
        count_query = apply_filter(count_query)

        # 排序和分页
        query = query.order_by(func.coalesce(Theater.updated_at, Theater.created_at).desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        items_result = await self.db.execute(query)
        items = list(items_result.scalars().all())

        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def update_theater(self, theater_id: str, user_id: str, data: TheaterUpdate) -> Theater:
        theater = await self._get_owned_theater(theater_id, user_id)

        # 只更新提供了值的字段
        update_fields = data.model_dump(exclude_unset=True)
        for field, value in update_fields.items():
            setattr(theater, field, value)

        await self.db.commit()
        await self.db.refresh(theater)
        return theater

    async def delete_theater(self, theater_id: str, user_id: str) -> None:
        theater = await self._get_owned_theater(theater_id, user_id)
        await self.db.delete(theater)
        await self.db.commit()

    async def save_canvas(self, theater_id: str, user_id: str, data: TheaterSaveRequest) -> dict:
        """全量同步画布状态：使用集合运算分类 create/update/delete"""
        theater = await self._get_owned_theater(theater_id, user_id)

        # --- 同步节点 ---
        existing_nodes_result = await self.db.execute(
            select(TheaterNode.id).where(TheaterNode.theater_id == theater_id)
        )
        existing_node_ids = set(row[0] for row in existing_nodes_result.all())

        # 为无 ID 的节点生成 UUID，构建 incoming 映射
        incoming_nodes: dict[str, TheaterNodeCreate] = {}
        for node in data.nodes:
            node_id = node.id or generate_uuid()
            node.id = node_id
            incoming_nodes[node_id] = node

        incoming_node_ids = set(incoming_nodes.keys())

        # 集合运算分类
        nodes_to_create = incoming_node_ids - existing_node_ids
        nodes_to_update = incoming_node_ids & existing_node_ids
        nodes_to_delete = existing_node_ids - incoming_node_ids

        # 批量删除
        for node_id in nodes_to_delete:
            await self.db.execute(
                delete(TheaterNode).where(TheaterNode.id == node_id)
            )

        # 批量创建
        for node_id in nodes_to_create:
            nd = incoming_nodes[node_id]
            self.db.add(TheaterNode(
                id=node_id,
                theater_id=theater_id,
                node_type=nd.node_type,
                position_x=nd.position_x,
                position_y=nd.position_y,
                width=nd.width,
                height=nd.height,
                z_index=nd.z_index,
                data=nd.data,
            ))

        # 批量更新
        for node_id in nodes_to_update:
            nd = incoming_nodes[node_id]
            result = await self.db.execute(
                select(TheaterNode).where(TheaterNode.id == node_id)
            )
            existing_node = result.scalar_one()
            existing_node.node_type = nd.node_type
            existing_node.position_x = nd.position_x
            existing_node.position_y = nd.position_y
            existing_node.width = nd.width
            existing_node.height = nd.height
            existing_node.z_index = nd.z_index
            existing_node.data = nd.data

        # --- 同步边 ---
        existing_edges_result = await self.db.execute(
            select(TheaterEdge.id).where(TheaterEdge.theater_id == theater_id)
        )
        existing_edge_ids = set(row[0] for row in existing_edges_result.all())

        incoming_edges: dict[str, TheaterEdgeCreate] = {}
        for edge in data.edges:
            edge_id = edge.id or generate_uuid()
            edge.id = edge_id
            incoming_edges[edge_id] = edge

        incoming_edge_ids = set(incoming_edges.keys())

        edges_to_create = incoming_edge_ids - existing_edge_ids
        edges_to_delete = existing_edge_ids - incoming_edge_ids
        edges_to_update = incoming_edge_ids & existing_edge_ids

        for edge_id in edges_to_delete:
            await self.db.execute(
                delete(TheaterEdge).where(TheaterEdge.id == edge_id)
            )

        for edge_id in edges_to_create:
            ed = incoming_edges[edge_id]
            self.db.add(TheaterEdge(
                id=edge_id,
                theater_id=theater_id,
                source_node_id=ed.source_node_id,
                target_node_id=ed.target_node_id,
                source_handle=ed.source_handle,
                target_handle=ed.target_handle,
                edge_type=ed.edge_type,
                animated=ed.animated,
                style=ed.style,
            ))

        for edge_id in edges_to_update:
            ed = incoming_edges[edge_id]
            result = await self.db.execute(
                select(TheaterEdge).where(TheaterEdge.id == edge_id)
            )
            existing_edge = result.scalar_one()
            existing_edge.source_node_id = ed.source_node_id
            existing_edge.target_node_id = ed.target_node_id
            existing_edge.source_handle = ed.source_handle
            existing_edge.target_handle = ed.target_handle
            existing_edge.edge_type = ed.edge_type
            existing_edge.animated = ed.animated
            existing_edge.style = ed.style

        # 更新 theater 元数据
        theater.node_count = len(incoming_node_ids)
        if data.canvas_viewport is not None:
            theater.canvas_viewport = data.canvas_viewport

        await self.db.commit()
        await self.db.refresh(theater)

        # 重新查询完整数据
        return await self.get_theater_detail(theater_id, user_id)

    async def duplicate_theater(self, theater_id: str, user_id: str) -> Theater:
        """复制剧场（含所有节点和边）"""
        detail = await self.get_theater_detail(theater_id, user_id)
        source = detail["theater"]

        # 创建新剧场
        new_theater = Theater(
            user_id=user_id,
            title=f"{source.title} (副本)",
            description=source.description,
            thumbnail_url=source.thumbnail_url,
            status="draft",
            canvas_viewport=source.canvas_viewport,
            settings=source.settings,
            node_count=source.node_count,
        )
        self.db.add(new_theater)
        await self.db.flush()

        # 旧 ID → 新 ID 的映射表（用于边的 source/target 重映射）
        node_id_map: dict[str, str] = {}

        for node in detail["nodes"]:
            new_id = generate_uuid()
            node_id_map[node.id] = new_id
            self.db.add(TheaterNode(
                id=new_id,
                theater_id=new_theater.id,
                node_type=node.node_type,
                position_x=node.position_x,
                position_y=node.position_y,
                width=node.width,
                height=node.height,
                z_index=node.z_index,
                data=node.data,
            ))

        for edge in detail["edges"]:
            new_source = node_id_map.get(edge.source_node_id, edge.source_node_id)
            new_target = node_id_map.get(edge.target_node_id, edge.target_node_id)
            self.db.add(TheaterEdge(
                id=generate_uuid(),
                theater_id=new_theater.id,
                source_node_id=new_source,
                target_node_id=new_target,
                source_handle=edge.source_handle,
                target_handle=edge.target_handle,
                edge_type=edge.edge_type,
                animated=edge.animated,
                style=edge.style,
            ))

        await self.db.commit()
        await self.db.refresh(new_theater)
        return new_theater
