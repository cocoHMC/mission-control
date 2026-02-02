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
        "hidden": false,
        "id": "bool1572654219",
        "name": "paired",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
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
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1789936913",
        "max": 0,
        "min": 0,
        "name": "os",
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
        "id": "text4161937994",
        "max": 0,
        "min": 0,
        "name": "arch",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "json490417661",
        "maxSize": 2000000,
        "name": "capabilities",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "select4219051947",
        "maxSelect": 1,
        "name": "execPolicy",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "deny",
          "ask",
          "allowlist",
          "full"
        ]
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text2849049070",
        "max": 0,
        "min": 0,
        "name": "allowlistSummary",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      }
    ],
    "id": "pbc_3598433047",
    "indexes": [],
    "listRule": null,
    "name": "nodes",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": null
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3598433047");

  return app.delete(collection);
})
