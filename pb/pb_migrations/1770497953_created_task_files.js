/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  try {
    // Backward/upgrade safety: avoid crashing if collection already exists.
    if (app.findCollectionByNameOrId("task_files")) return;
  } catch {
    // ignore and proceed with creation
  }

  const collection = new Collection({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "@request.auth.id != \"\"",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_taskId",
        "max": 0,
        "min": 0,
        "name": "taskId",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_title",
        "max": 0,
        "min": 0,
        "name": "title",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "file_file",
        "maxSelect": 1,
        "maxSize": 104857600,
        "mimeTypes": [
          "application/pdf",
          "image/*",
          "text/plain",
          "application/json",
          "application/zip"
        ],
        "name": "file",
        "presentable": false,
        "protected": true,
        "required": true,
        "system": false,
        "thumbs": [],
        "type": "file"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text_shareToken",
        "max": 0,
        "min": 0,
        "name": "shareToken",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "date_createdAt",
        "max": "",
        "min": "",
        "name": "createdAt",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "date_updatedAt",
        "max": "",
        "min": "",
        "name": "updatedAt",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "date"
      }
    ],
    "id": "pbc_1770497953",
    "indexes": [
      "CREATE INDEX `idx_taskId_task_files` ON `task_files` (`taskId`)",
      "CREATE UNIQUE INDEX `idx_shareToken_task_files` ON `task_files` (`shareToken`)"
    ],
    "listRule": "@request.auth.id != \"\"",
    "name": "task_files",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("task_files");
  return app.delete(collection);
});
