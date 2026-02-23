/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("projects")

  const has = (name) => {
    try {
      return !!collection.fields.getByName(name)
    } catch {
      return false
    }
  }

  if (!has("workspaceId")) {
    collection.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_project_workspace_id",
      "max": 0,
      "min": 0,
      "name": "workspaceId",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  const idx = "CREATE INDEX `idx_workspace_projects` ON `projects` (`workspaceId`)"
  if (!Array.isArray(collection.indexes)) collection.indexes = []
  if (!collection.indexes.includes(idx)) collection.indexes.push(idx)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("projects")

  collection.fields.removeByName("workspaceId")

  const idx = "CREATE INDEX `idx_workspace_projects` ON `projects` (`workspaceId`)"
  collection.indexes = (collection.indexes || []).filter((value) => value !== idx)

  return app.save(collection)
})
