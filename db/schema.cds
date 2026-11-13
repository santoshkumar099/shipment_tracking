
namespace shipment.tracking;

using { cuid, managed } from '@sap/cds/common';

// Shipment lifecycle
type ShipmentStatus : String enum {
    Created;
    PickedUp;
    InTransit;
    OutForDelivery;
    Delivered;
}

// Exception categories
type ExceptionType : String enum {
    Delayed;
    Lost;
    Damaged;
    AddressIssue;
    DeliveryFailed;
}

// Exception severity
type ExceptionSeverity : String enum {
    Low;
    Medium;
    High;
    Critical;
}

// Exception resolution lifecycle
type ResolutionStatus : String enum {
    Open;
    InProgress;
    Resolved;
}

// Tracking event categories
type TrackingEventType : String enum {
    ShipmentCreated;
    StatusChanged;
    LocationUpdated;
    ETARevised;
    DeliveryAttempt;
    Delivered;
}

// Audit event categories
type AuditEventType : String enum {
    ShipmentCreated;
    StatusChanged;
    LocationChanged;
    ETAChanged;
    ShipmentUpdated;
    ExceptionCreated;
    ExceptionUpdated;
}

// Main shipment information
entity Shipments : cuid, managed {
    trackingNumber       : String(30) not null;
    shipmentNumber       : String(30) not null;

    source               : String(100) not null;
    destination          : String(100) not null;
    currentLocation      : String(100);

    shipmentStatus       : ShipmentStatus
                           not null default 'Created';

    shipmentDate         : Timestamp not null;
    eta                  : Timestamp not null;
    originalETA          : Timestamp;
    revisedETA           : Timestamp;
    actualDeliveryDate   : Timestamp;

    carrier              : String(100);
    vehicleNumber        : String(30);
    driverName           : String(100);
    driverContact        : String(30);

    lastTrackingUpdate   : Timestamp;
    investigationRequired: Boolean default false;
    deliveryAttemptCount: Integer default 0;

    trackingHistory      : Association to many TrackingHistory
                           on trackingHistory.shipment = $self;

    exceptions           : Association to many ShipmentExceptions
                           on exceptions.shipment = $self;

    auditLogs            : Association to many ShipmentAuditLogs
                           on auditLogs.shipment = $self;
}

// Immutable record of shipment movements and tracking events
entity TrackingHistory : cuid, managed {
    shipment             : Association to Shipments not null;

    previousLocation     : String(100);
    currentLocation      : String(100);

    previousStatus       : ShipmentStatus;
    newStatus            : ShipmentStatus;

    eventType            : TrackingEventType not null;
    eventDateTime        : Timestamp not null;

    previousETA          : Timestamp;
    newETA               : Timestamp;

    remarks              : String(500);
    updatedBy            : String(100);
}

// Shipment exception and resolution information
entity ShipmentExceptions : cuid, managed {
    shipment             : Association to Shipments not null;

    exceptionType        : ExceptionType not null;
    exceptionDateTime    : Timestamp not null;

    location             : String(100) not null;
    description          : String(1000) not null;
    severity             : ExceptionSeverity not null default 'Medium';

    resolutionStatus     : ResolutionStatus
                           not null default 'Open';

    resolutionRemarks    : String(1000);
    resolvedDate         : Timestamp;

    createdBy            : String(100);
    resolvedBy           : String(100);

    revisedDeliveryInfo  : String(500);
}

// Audit trail for important shipment and exception changes
entity ShipmentAuditLogs : cuid, managed {
    shipment             : Association to Shipments not null;

    exception            : Association to ShipmentExceptions;

    eventType            : AuditEventType not null;

    fieldName            : String(100);
    oldValue             : String(1000);
    newValue             : String(1000);

    changedBy            : String(100);
    changedAt            : Timestamp not null;
    remarks              : String(500);
}