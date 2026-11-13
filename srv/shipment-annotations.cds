using { ShipmentService } from './shipment-service';

annotate ShipmentService.Shipments with @(
UI.HeaderInfo: {
TypeName: 'Shipment',
TypeNamePlural: 'Shipments',
Title: { Value: trackingNumber },
Description: { Value: shipmentStatus }
},

UI.LineItem: [
    { Value: trackingNumber, Label: 'Tracking Number' },
    { Value: shipmentNumber, Label: 'Shipment Number' },
    { Value: source, Label: 'Origin' },
    { Value: destination, Label: 'Destination' },
    { Value: currentLocation, Label: 'Current Location' },
    { Value: shipmentStatus, Label: 'Shipment Status' },
    { Value: shipmentDate, Label: 'Shipment Date' },
    { Value: eta, Label: 'Expected Delivery Date' },
    { Value: actualDeliveryDate, Label: 'Actual Delivery Date' },
    { Value: carrier, Label: 'Carrier' },
    { Value: vehicleNumber, Label: 'Vehicle Number' }
],

UI.SelectionFields: [
    trackingNumber,
    shipmentNumber,
    shipmentStatus,
    source,
    destination,
    carrier
]


);

annotate ShipmentService.Shipments with {
trackingNumber @title: 'Tracking Number';
shipmentNumber @title: 'Shipment Number';
source @title: 'Origin';
destination @title: 'Destination';
currentLocation @title: 'Current Location';
shipmentStatus @title: 'Shipment Status';
shipmentDate @title: 'Shipment Date';
eta @title: 'Expected Delivery Date';
actualDeliveryDate @title: 'Actual Delivery Date';
carrier @title: 'Carrier';
vehicleNumber @title: 'Vehicle Number';
driverName @title: 'Driver Name';
driverContact @title: 'Driver Contact';
lastTrackingUpdate @title: 'Last Tracking Update';
};

annotate ShipmentService.Shipments with @Capabilities: {
InsertRestrictions.Insertable: true,
UpdateRestrictions.Updatable: true,
DeleteRestrictions.Deletable: false
};

annotate ShipmentService.Shipments with @(
UI.FieldGroup #ShipmentDetails: {
Data: [
{ $Type: 'UI.DataField', Value: trackingNumber, Label: 'Tracking Number' },
{ $Type: 'UI.DataField', Value: shipmentNumber, Label: 'Shipment Number' },
{ $Type: 'UI.DataField', Value: source, Label: 'Origin' },
{ $Type: 'UI.DataField', Value: destination, Label: 'Destination' },
{ $Type: 'UI.DataField', Value: currentLocation, Label: 'Current Location' },
{ $Type: 'UI.DataField', Value: shipmentStatus, Label: 'Shipment Status' }
]
},

UI.FieldGroup #DeliveryDetails: {
    Data: [
        { $Type: 'UI.DataField', Value: shipmentDate, Label: 'Shipment Date' },
        { $Type: 'UI.DataField', Value: eta, Label: 'Expected Delivery Date' },
        { $Type: 'UI.DataField', Value: originalETA, Label: 'Original ETA' },
        { $Type: 'UI.DataField', Value: revisedETA, Label: 'Revised ETA' },
        { $Type: 'UI.DataField', Value: actualDeliveryDate, Label: 'Actual Delivery Date' },
        { $Type: 'UI.DataField', Value: lastTrackingUpdate, Label: 'Last Tracking Update' }
    ]
},

UI.FieldGroup #CarrierDetails: {
    Data: [
        { $Type: 'UI.DataField', Value: carrier, Label: 'Carrier' },
        { $Type: 'UI.DataField', Value: vehicleNumber, Label: 'Vehicle Number' },
        { $Type: 'UI.DataField', Value: driverName, Label: 'Driver Name' },
        { $Type: 'UI.DataField', Value: driverContact, Label: 'Driver Contact' },
        { $Type: 'UI.DataField', Value: deliveryAttemptCount, Label: 'Delivery Attempts' },
        { $Type: 'UI.DataField', Value: investigationRequired, Label: 'Investigation Required' }
    ]
},

UI.Facets: [
    {
        $Type: 'UI.ReferenceFacet',
        ID: 'ShipmentDetails',
        Label: 'Shipment Information',
        Target: '@UI.FieldGroup#ShipmentDetails'
    },
    {
        $Type: 'UI.ReferenceFacet',
        ID: 'DeliveryDetails',
        Label: 'Delivery Information',
        Target: '@UI.FieldGroup#DeliveryDetails'
    },
    {
        $Type: 'UI.ReferenceFacet',
        ID: 'CarrierDetails',
        Label: 'Carrier and Driver Information',
        Target: '@UI.FieldGroup#CarrierDetails'
    },
    {
        $Type: 'UI.ReferenceFacet',
        ID: 'ShipmentExceptions',
        Label: 'Shipment Exceptions',
        Target: 'exceptions/@UI.LineItem#ExceptionList'
    }
]


);

annotate ShipmentService.Shipments with @odata.draft.enabled;

annotate ShipmentService.Shipments with @(
UI.LineItem #ShipmentActions: [
{
$Type: 'UI.DataFieldForAction',
Action: 'ShipmentService.createException',
Label: 'Create Exception',
InvocationGrouping: #Isolated
}
]
);

annotate ShipmentService.Shipments with @Capabilities.SearchRestrictions: {
Searchable: true
};

annotate ShipmentService.Shipments with @(
UI.Identification: [
{
$Type: 'UI.DataFieldForAction',
Action: 'ShipmentService.createException',
Label: 'Create Exception',
InvocationGrouping: #Isolated
}
]
);

annotate ShipmentService.ShipmentExceptions with @(
    UI.LineItem #ExceptionList: [
        { $Type: 'UI.DataField', Value: exceptionType, Label: 'Exception Type' },
        { $Type: 'UI.DataField', Value: exceptionDateTime, Label: 'Exception Date' },
        { $Type: 'UI.DataField', Value: location, Label: 'Location' },
        { $Type: 'UI.DataField', Value: description, Label: 'Description' },
        { $Type: 'UI.DataField', Value: severity, Label: 'Severity' },
        { $Type: 'UI.DataField', Value: resolutionStatus, Label: 'Resolution Status' },
        { $Type: 'UI.DataField', Value: resolutionRemarks, Label: 'Resolution Remarks' },
        { $Type: 'UI.DataField', Value: resolvedBy, Label: 'Resolved By' },
        { $Type: 'UI.DataField', Value: resolvedDate, Label: 'Resolved Date' },
        { $Type: 'UI.DataField', Value: revisedDeliveryInfo, Label: 'Revised Delivery' },
        {
            $Type: 'UI.DataFieldForAction',
            Action: 'ShipmentService.updateResolution',
            Label: 'Update Resolution',
            InvocationGrouping: #Isolated
        }
    ]
);