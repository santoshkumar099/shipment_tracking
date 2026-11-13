sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"shipment/tracking/shipmenttracking/test/integration/pages/ShipmentsList.gen",
	"shipment/tracking/shipmenttracking/test/integration/pages/ShipmentsObjectPage.gen"
], function (JourneyRunner, ShipmentsListGenerated, ShipmentsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('shipment/tracking/shipmenttracking') + '/test/flp.html#app-preview',
        pages: {
			onTheShipmentsListGenerated: ShipmentsListGenerated,
			onTheShipmentsObjectPageGenerated: ShipmentsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

