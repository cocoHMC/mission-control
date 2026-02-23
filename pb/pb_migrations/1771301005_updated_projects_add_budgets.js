/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_9051300001")

  const has = (name) => {
    try {
      return !!collection.fields.getByName(name)
    } catch {
      return false
    }
  }

  if (!has("dailyBudgetUsd")) {
    collection.fields.addAt(7, new Field({
      "hidden": false,
      "id": "number_project_daily_budget",
      "max": null,
      "min": null,
      "name": "dailyBudgetUsd",
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  if (!has("monthlyBudgetUsd")) {
    collection.fields.addAt(8, new Field({
      "hidden": false,
      "id": "number_project_monthly_budget",
      "max": null,
      "min": null,
      "name": "monthlyBudgetUsd",
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  if (!has("budgetWarnPct")) {
    collection.fields.addAt(9, new Field({
      "hidden": false,
      "id": "number_project_budget_warn_pct",
      "max": null,
      "min": null,
      "name": "budgetWarnPct",
      "onlyInt": false,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }))
  }

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_9051300001")

  collection.fields.removeByName("dailyBudgetUsd")
  collection.fields.removeByName("monthlyBudgetUsd")
  collection.fields.removeByName("budgetWarnPct")

  return app.save(collection)
})

