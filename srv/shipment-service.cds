using { shipment.tracking as db } from '../db/schema';

service ShipmentService {

  entity Shipments as projection on db.Shipments actions {
action createException(
exceptionType       : String(30),
location            : String(100),
description         : String(1000),
severity            : String(20),
revisedDeliveryInfo : String(500)
) returns ShipmentExceptions;
};


    entity TrackingHistory as projection on db.TrackingHistory;

    entity ShipmentExceptions as projection on db.ShipmentExceptions actions {
    action updateResolution(
        resolutionStatus  : String(20),
        resolutionRemarks : String(1000),
        resolvedBy        : String(100)
    ) returns ShipmentExceptions;
};

    entity ShipmentAuditLogs as projection on db.ShipmentAuditLogs;

    type DashboardKPIs {
        totalShipments     : Integer;
        deliveredShipments : Integer;
        delayedShipments   : Integer;
        openExceptions     : Integer;
        criticalExceptions : Integer;
    }

    // Update shipment location, status, or ETA
    action updateTracking(
        shipmentID     : UUID,
        currentLocation: String(100),
        newStatus      : String(30),
        newETA         : Timestamp,
        remarks        : String(500)
    ) returns Shipments;


    // Progress or resolve an existing exception
    action updateException(
        exceptionID     : UUID,
        resolutionStatus: String(20),
        resolutionRemarks: String(1000),
        resolvedBy      : String(100)
    ) returns ShipmentExceptions;

    // Record an unsuccessful delivery attempt
    action recordDeliveryAttempt(
        shipmentID: UUID,
        location  : String(100),
        remarks   : String(500)
    ) returns Shipments;

    // Reporting functions
    function getDashboardKPIs() returns DashboardKPIs;

    function getDelayedShipments() returns many Shipments;
}