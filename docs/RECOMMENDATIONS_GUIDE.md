# 推荐系统 (Recommendations) 指南

本文档介绍推荐分区与条目管理的接口、权限要求以及典型用法示例。

## 功能概览

- 推荐分区管理：创建、更新、删除分区，支持排序 (sort_order) 与启用/禁用 (active)
- 推荐条目管理：在分区中添加/删除图书，支持按 position 排序与批量重排
- 公开展示：提供 `GET /recommendations/public` 返回启用中的分区及条目

## 权限模型

- 管理接口需要 `RECOMMENDATION_MANAGE (>=1)` 且需登录
- 公开接口无需登录

## 端点速览

- 公共
  - GET `/recommendations/public` 获取启用的推荐分区（含条目）
- 管理（需登录 + RECOMMENDATION_MANAGE≥1）
  - GET `/recommendations/sections?all=true` 列出分区（all=true 含停用）
  - GET `/recommendations/sections/:id` 获取分区详情
  - POST `/recommendations/sections` 创建分区
  - PATCH `/recommendations/sections/:id` 更新分区（支持批量分区重排）
  - DELETE `/recommendations/sections/:id` 删除分区
  - POST `/recommendations/sections/:id/items` 向分区添加图书
  - DELETE `/recommendations/sections/:sectionId/items/:itemId` 从分区移除条目
  - PATCH `/recommendations/sections/:id/items/reorder` 在分区内重排条目

## 请求/响应示例

### 创建分区

POST /recommendations/sections
Authorization: Bearer <token>
Content-Type: application/json

{
  "key": "today_hot",
  "title": "今日最热",
  "description": "根据近期热度",
  "sort_order": 0,
  "active": true
}

响应：200
{
  "id": 1,
  "key": "today_hot",
  "title": "今日最热",
  "active": true,
  "sort_order": 0,
  "items": []
}

### 添加条目

POST /recommendations/sections/1/items
{
  "bookId": 42,
  "position": 0,
  "note": "编辑推荐"
}

响应：200
{
  "id": 10,
  "section": {"id": 1},
  "book": {"id": 42},
  "position": 0,
  "note": "编辑推荐"
}

### 公开接口

GET /recommendations/public
响应：200
[
  {
    "id": 1,
    "key": "today_hot",
    "title": "今日最热",
    "active": true,
    "sort_order": 0,
    "items": [
      { "id": 10, "book": { "id": 42, "tags": [...] }, "position": 0, "note": "编辑推荐" }
    ]
  }
]

## 错误与约束

- 创建分区时 `key` 必须唯一；重复会返回 409
- 分区/条目不存在时返回 404
- 在分区内重排条目时，所有提供的 itemId 必须属于该分区，否则 400

## 最佳实践

- 使用 `sort_order` 控制多个分区的展示顺序
- 为不同主题创建独立分区，按需启用/停用
- 条目展示顺序通过 `position` 控制；重排时传完整有序的条目 ID 列表
