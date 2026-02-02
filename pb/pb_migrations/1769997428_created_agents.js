/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": null,
    "deleteRule": null,
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
        "id": "text1731158936",
        "max": 0,
        "min": 0,
        "name": "displayName",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1466534506",
        "max": 0,
        "min": 0,
        "name": "role",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1408192909",
        "max": 0,
        "min": 0,
        "name": "openclawAgentId",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select2063623452",
        "maxSelect": 1,
        "name": "status",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "idle",
          "active",
          "blocked",
          "offline"
        ]
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text4207236249",
        "max": 0,
        "min": 0,
        "name": "currentTaskId",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "date1925370682",
        "max": "",
        "min": "",
        "name": "lastSeenAt",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "date2055331774",
        "max": "",
        "min": "",
        "name": "lastWorklogAt",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "select2617527217",
        "maxSelect": 1,
        "name": "modelTier",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "cheap",
          "mid",
          "expensive"
        ]
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1842391587",
        "max": 0,
        "min": 0,
        "name": "defaultNodeId",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      }
    ],
    "id": "pbc_2726680096",
    "indexes": [],
    "listRule": null,
    "name": "agents",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": null
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2726680096");

  return app.delete(collection);
})
