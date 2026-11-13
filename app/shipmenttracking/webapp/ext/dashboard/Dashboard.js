sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend(
        "shipment.tracking.shipmenttracking.ext.dashboard.Dashboard",
        {
            onInit: function () {
                this.getView().setModel(new JSONModel({
                    totalShipments: 0,
                    deliveredShipments: 0,
                    delayedShipments: 0,
                    openExceptions: 0
                }), "kpis");

                this.onRefresh();
            },

            onRefresh: function () {
                var oModel = this.getOwnerComponent().getModel();
                var oContext = oModel.bindContext("/getDashboardKPIs()");

                oContext.requestObject().then(function (oData) {
                    this.getView().getModel("kpis").setData(oData);
                }.bind(this)).catch(function () {
                    MessageToast.show("Could not load dashboard KPIs.");
                });
            }
        }
    );
});
