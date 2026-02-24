/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_9051300010")

  const has = (name) => {
    try {
      return !!collection.fields.getByName(name)
    } catch {
      return false
    }
  }

  if (!has("openclawWorkspacePath")) {
    collection.fields.addAt(3, new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text_workspace_openclaw_path",
      "max": 0,
      "min": 0,
      "name": "openclawWorkspacePath",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  const idx = "CREATE UNIQUE INDEX `idx_openclaw_workspace_workspaces` ON `workspaces` (`openclawWorkspacePath`) WHERE `openclawWorkspacePath` != ''"
  if (!(collection.indexes || []).includes(idx)) {
    collection.indexes = [...(collection.indexes || []), idx]
  }

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_9051300010")

  collection.fields.removeByName("openclawWorkspacePath")
  const idx = "CREATE UNIQUE INDEX `idx_openclaw_workspace_workspaces` ON `workspaces` (`openclawWorkspacePath`) WHERE `openclawWorkspacePath` != ''"
  collection.indexes = (collection.indexes || []).filter((v) => v !== idx)

  return app.save(collection)
})
