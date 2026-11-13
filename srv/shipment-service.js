
import cds from '@sap/cds';

const { SELECT, INSERT, UPDATE } = cds.ql;

const SHIPMENT_STATUSES = [
    'Created',
    'PickedUp',
    'InTransit',
    'OutForDelivery',
    'Delivered'
];

const EXCEPTION_TYPES = [
    'Delayed',
    'Lost',
    'Damaged',
    'AddressIssue',
    'DeliveryFailed'
];

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

const RESOLUTION_STATUSES = ['Open', 'InProgress', 'Resolved'];

const NEXT_STATUS = {
    Created: 'PickedUp',
    PickedUp: 'InTransit',
    InTransit: 'OutForDelivery',
    OutForDelivery: 'Delivered'
};

const NEXT_RESOLUTION_STATUS = {
    Open: 'InProgress',
    InProgress: 'Resolved'
};

class ShipmentService extends cds.ApplicationService {

    async init() {
        const db = cds.entities('shipment.tracking');

        const Shipments = db.Shipments;
        const TrackingHistory = db.TrackingHistory;
        const ShipmentExceptions = db.ShipmentExceptions;
        const ShipmentAuditLogs = db.ShipmentAuditLogs;

        const now = () => new Date();
        const makeID = () => cds.utils.uuid();

        // --------------------------------------------------
        // Helper: Record shipment tracking history
        // --------------------------------------------------

        const recordHistory = async (tx, entry) => {
            await tx.run(
                INSERT.into(TrackingHistory).entries({
                    ID: makeID(),
                    ...entry
                })
            );
        };

        // --------------------------------------------------
        // Helper: Record shipment audit log
        // --------------------------------------------------

        const recordAudit = async (tx, entry) => {
            await tx.run(
                INSERT.into(ShipmentAuditLogs).entries({
                    ID: makeID(),
                    changedAt: now(),
                    changedBy: 'system',
                    ...entry
                })
            );
        };

        // --------------------------------------------------
        // 1. Validate shipment creation
        // --------------------------------------------------

        this.before('CREATE', 'Shipments', async req => {
            const data = req.data;

            if (
                typeof data.trackingNumber !== 'string' ||
                !data.trackingNumber.trim()
            ) {
                return req.reject(400, 'Tracking number is required.');
            }

            if (
                typeof data.shipmentNumber !== 'string' ||
                !data.shipmentNumber.trim()
            ) {
                return req.reject(400, 'Shipment number is required.');
            }

            data.trackingNumber = data.trackingNumber.trim();
            data.shipmentNumber = data.shipmentNumber.trim();

            if (
                typeof data.source !== 'string' ||
                !data.source.trim()
            ) {
                return req.reject(400, 'Origin is required.');
            }

            if (
                typeof data.destination !== 'string' ||
                !data.destination.trim()
            ) {
                return req.reject(400, 'Destination is required.');
            }

            data.source = data.source.trim();
            data.destination = data.destination.trim();

            if (
                data.source.toLowerCase() ===
                data.destination.toLowerCase()
            ) {
                return req.reject(
                    400,
                    'Origin and destination cannot be the same.'
                );
            }

            // Check whether the tracking number already exists.
            const duplicate = await SELECT.one
                .from(Shipments)
                .where({ trackingNumber: data.trackingNumber });

            if (duplicate) {
                return req.reject(
                    409,
                    'Tracking number already exists.'
                );
            }

            // Validate shipment date and ETA.
            if (!data.shipmentDate || !data.eta) {
                return req.reject(
                    400,
                    'Shipment date and expected delivery date are required.'
                );
            }

            const shipmentDate = new Date(data.shipmentDate);
            const eta = new Date(data.eta);

            if (
                Number.isNaN(shipmentDate.getTime()) ||
                Number.isNaN(eta.getTime())
            ) {
                return req.reject(
                    400,
                    'Shipment date and expected delivery date must be valid dates.'
                );
            }

            if (eta < shipmentDate) {
                return req.reject(
                    400,
                    'Expected delivery date cannot be earlier than shipment date.'
                );
            }

            // Every new shipment must start in Created status.
            if (
                data.shipmentStatus &&
                data.shipmentStatus !== 'Created'
            ) {
                return req.reject(
                    400,
                    'A new shipment must start with status Created.'
                );
            }

            // The actual delivery date is set only upon delivery.
            if (data.actualDeliveryDate) {
                return req.reject(
                    400,
                    'Actual delivery date cannot be set during creation.'
                );
            }

            // Initialize system-managed fields.
            data.shipmentStatus = 'Created';
            data.currentLocation =
                typeof data.currentLocation === 'string'
                    ? data.currentLocation.trim() || null
                    : null;

            data.originalETA = data.eta;
            data.lastTrackingUpdate = now();
            data.investigationRequired = false;
            data.deliveryAttemptCount = 0;
        });

        // --------------------------------------------------
        // 2. Record initial shipment history and audit log
        // --------------------------------------------------

        this.after('CREATE', 'Shipments', async (shipment, req) => {
            if (!shipment?.ID) {
                return;
            }

            const tx = cds.tx(req);
            const timestamp = now();

            await recordHistory(tx, {
                shipment_ID: shipment.ID,
                currentLocation: shipment.currentLocation || null,
                newStatus: shipment.shipmentStatus || 'Created',
                eventType: 'ShipmentCreated',
                eventDateTime: timestamp,
                remarks: 'Shipment created',
                updatedBy: 'system'
            });

            await recordAudit(tx, {
                shipment_ID: shipment.ID,
                eventType: 'ShipmentCreated',
                fieldName: 'shipmentStatus',
                oldValue: '',
                newValue: shipment.shipmentStatus || 'Created',
                remarks: 'Initial shipment created'
            });
        });

        // --------------------------------------------------
        // 3. Update shipment status, location, or ETA
        // --------------------------------------------------

        this.on('updateTracking', async req => {
            const {
                shipmentID,
                currentLocation,
                newStatus,
                newETA,
                remarks
            } = req.data;

            if (!shipmentID) {
                return req.reject(400, 'Shipment ID is required.');
            }

            const tx = cds.tx(req);

            const shipment = await tx.run(
                SELECT.one.from(Shipments).where({ ID: shipmentID })
            );

            if (!shipment) {
                return req.reject(404, 'Shipment not found.');
            }

            if (shipment.shipmentStatus === 'Delivered') {
                return req.reject(
                    400,
                    'Delivered shipments cannot be updated.'
                );
            }

            const updates = {};
            const timestamp = now();

            const targetStatus =
                newStatus ?? shipment.shipmentStatus;

            const targetLocation =
                currentLocation === undefined
                    ? shipment.currentLocation
                    : currentLocation;

            const locationRequiredStatuses = [
                'PickedUp',
                'InTransit',
                'OutForDelivery'
            ];

            if (
                locationRequiredStatuses.includes(targetStatus) &&
                (
                    typeof targetLocation !== 'string' ||
                    !targetLocation.trim()
                )
            ) {
                return req.reject(
                    400,
                    `Current location is required when shipment status is ${targetStatus}.`
                );
            }

            // Validate shipment status transitions.
            if (
                newStatus !== undefined &&
                newStatus !== shipment.shipmentStatus
            ) {
                if (!SHIPMENT_STATUSES.includes(newStatus)) {
                    return req.reject(
                        400,
                        'Invalid shipment status.'
                    );
                }

                if (NEXT_STATUS[shipment.shipmentStatus] !== newStatus) {
                    return req.reject(
                        400,
                        `Invalid status transition from ${shipment.shipmentStatus} to ${newStatus}.`
                    );
                }

                if (newStatus === 'Delivered') {
                    if (
                        timestamp < new Date(shipment.shipmentDate)
                    ) {
                        return req.reject(
                            400,
                            'Actual delivery date cannot be earlier than shipment date.'
                        );
                    }

                    const exceptions = await tx.run(
                        SELECT.from(ShipmentExceptions)
                            .where({ shipment_ID: shipmentID })
                    );

                    const blockingException = exceptions.find(
                        exception =>
                            ['Lost', 'AddressIssue'].includes(
                                exception.exceptionType
                            ) &&
                            exception.resolutionStatus !== 'Resolved'
                    );

                    if (blockingException) {
                        return req.reject(
                            400,
                            'Resolve all Lost and AddressIssue exceptions before delivery.'
                        );
                    }

                    updates.actualDeliveryDate = timestamp;
                }

                updates.shipmentStatus = newStatus;

                await recordHistory(tx, {
                    shipment_ID: shipmentID,
                    previousStatus: shipment.shipmentStatus,
                    newStatus,
                    eventType: newStatus === 'Delivered'
                        ? 'Delivered'
                        : 'StatusChanged',
                    eventDateTime: timestamp,
                    remarks: remarks || 'Shipment status updated',
                    updatedBy: 'system'
                });

                await recordAudit(tx, {
                    shipment_ID: shipmentID,
                    eventType: 'StatusChanged',
                    fieldName: 'shipmentStatus',
                    oldValue: shipment.shipmentStatus,
                    newValue: newStatus,
                    remarks: remarks || 'Shipment status updated'
                });
            }

            // Record location changes.
            if (
                currentLocation !== undefined &&
                currentLocation !== shipment.currentLocation
            ) {
                if (
                    typeof currentLocation !== 'string' ||
                    !currentLocation.trim()
                ) {
                    return req.reject(
                        400,
                        'Location cannot be empty.'
                    );
                }

                const cleanedLocation = currentLocation.trim();

                updates.currentLocation = cleanedLocation;

                await recordHistory(tx, {
                    shipment_ID: shipmentID,
                    previousLocation: shipment.currentLocation,
                    currentLocation: cleanedLocation,
                    eventType: 'LocationUpdated',
                    eventDateTime: timestamp,
                    remarks: remarks || 'Shipment location updated',
                    updatedBy: 'system'
                });

                await recordAudit(tx, {
                    shipment_ID: shipmentID,
                    eventType: 'LocationChanged',
                    fieldName: 'currentLocation',
                    oldValue: shipment.currentLocation || '',
                    newValue: cleanedLocation,
                    remarks: remarks || 'Shipment location updated'
                });
            }

            // Record ETA revisions.
            if (newETA !== undefined) {
                const revisedETA = new Date(newETA);

                if (Number.isNaN(revisedETA.getTime())) {
                    return req.reject(
                        400,
                        'A valid ETA is required.'
                    );
                }

                if (
                    revisedETA < new Date(shipment.shipmentDate)
                ) {
                    return req.reject(
                        400,
                        'ETA cannot be earlier than shipment date.'
                    );
                }

                if (shipment.actualDeliveryDate) {
                    return req.reject(
                        400,
                        'ETA cannot be changed after delivery.'
                    );
                }

                if (
                    revisedETA.getTime() !==
                    new Date(shipment.eta).getTime()
                ) {
                    updates.eta = revisedETA;
                    updates.revisedETA = revisedETA;

                    await recordHistory(tx, {
                        shipment_ID: shipmentID,
                        previousETA: shipment.eta,
                        newETA: revisedETA,
                        eventType: 'ETARevised',
                        eventDateTime: timestamp,
                        remarks: remarks || 'Delivery ETA revised',
                        updatedBy: 'system'
                    });

                    await recordAudit(tx, {
                        shipment_ID: shipmentID,
                        eventType: 'ETAChanged',
                        fieldName: 'eta',
                        oldValue: String(shipment.eta),
                        newValue: revisedETA.toISOString(),
                        remarks: remarks || 'Delivery ETA revised'
                    });
                }
            }

            if (Object.keys(updates).length === 0) {
                return shipment;
            }

            updates.lastTrackingUpdate = timestamp;

            await tx.run(
                UPDATE(Shipments)
                    .set(updates)
                    .where({ ID: shipmentID })
            );

            return await tx.run(
                SELECT.one.from(Shipments)
                    .where({ ID: shipmentID })
            );
        });

        // --------------------------------------------------
        // 4. Create a shipment exception
        // --------------------------------------------------

      this.on('createException', 'Shipments', async req => {
    const {
        exceptionType,
        location,
        description,
        severity = 'Medium',
        revisedDeliveryInfo
    } = req.data;

    const shipmentID = req.params?.[0]?.ID;

    if (!shipmentID) {
        return req.reject(
            400,
            'Shipment ID is required.'
        );
    }

            if (!EXCEPTION_TYPES.includes(exceptionType)) {
                return req.reject(
                    400,
                    'Invalid exception type.'
                );
            }

            if (!SEVERITIES.includes(severity)) {
                return req.reject(
                    400,
                    'Invalid exception severity.'
                );
            }

            if (
                typeof location !== 'string' ||
                !location.trim() ||
                typeof description !== 'string' ||
                !description.trim()
            ) {
                return req.reject(
                    400,
                    'Exception location and description are required.'
                );
            }

            if (
                exceptionType === 'Delayed' &&
                (
                    typeof revisedDeliveryInfo !== 'string' ||
                    !revisedDeliveryInfo.trim()
                )
            ) {
                return req.reject(
                    400,
                    'Revised delivery information is required for a Delayed exception.'
                );
            }

            const tx = cds.tx(req);

            const shipment = await tx.run(
                SELECT.one.from(Shipments)
                    .where({ ID: shipmentID })
            );

            if (!shipment) {
                return req.reject(404, 'Shipment not found.');
            }

            if (shipment.shipmentStatus === 'Delivered') {
                return req.reject(
                    400,
                    'Cannot create a new exception for a delivered shipment.'
                );
            }

            const exceptionID = makeID();
            const timestamp = now();

            await tx.run(
                INSERT.into(ShipmentExceptions).entries({
                    ID: exceptionID,
                    shipment_ID: shipmentID,
                    exceptionType,
                    exceptionDateTime: timestamp,
                    location: location.trim(),
                    description: description.trim(),
                    severity,
                    revisedDeliveryInfo:
                        revisedDeliveryInfo?.trim() || null,
                    resolutionStatus: 'Open',
                    createdBy: 'system'
                })
            );

            const requiresInvestigation = [
                'Lost',
                'Damaged',
                'AddressIssue'
            ].includes(exceptionType);

            if (requiresInvestigation) {
                await tx.run(
                    UPDATE(Shipments)
                        .set({ investigationRequired: true })
                        .where({ ID: shipmentID })
                );
            }

            await recordAudit(tx, {
                shipment_ID: shipmentID,
                exception_ID: exceptionID,
                eventType: 'ExceptionCreated',
                fieldName: 'exceptionType',
                newValue: exceptionType,
                remarks: description.trim()
            });

            return await tx.run(
                SELECT.one.from(ShipmentExceptions)
                    .where({ ID: exceptionID })
            );
        });

        // --------------------------------------------------
       
        // --------------------------------------------------
        // 5. Update or resolve a shipment exception
        // --------------------------------------------------

        const handleUpdateException = async req => {
            const {
                exceptionID,
                resolutionStatus,
                resolutionRemarks,
                resolvedBy
            } = req.data;

            if (!exceptionID) {
                return req.reject(
                    400,
                    'Exception ID is required.'
                );
            }

            // Normalize status case and whitespace.
            const normalizedStatus =
                typeof resolutionStatus === 'string'
                    ? RESOLUTION_STATUSES.find(
                          status =>
                              status.toLowerCase() ===
                              resolutionStatus.trim().toLowerCase()
                      )
                    : undefined;

            if (!normalizedStatus) {
                return req.reject(
                    400,
                    `Invalid resolution status. Allowed values: ${RESOLUTION_STATUSES.join(', ')}`
                );
            }

            const tx = cds.tx(req);

            const exception = await tx.run(
                SELECT.one.from(ShipmentExceptions)
                    .where({ ID: exceptionID })
            );

            if (!exception) {
                return req.reject(
                    404,
                    'Exception not found.'
                );
            }

            if (exception.resolutionStatus === 'Resolved') {
                return req.reject(
                    400,
                    'A resolved exception cannot be changed.'
                );
            }

            // Require remarks and resolver when resolving.
            if (
                normalizedStatus === 'Resolved' &&
                (
                    typeof resolutionRemarks !== 'string' ||
                    !resolutionRemarks.trim() ||
                    typeof resolvedBy !== 'string' ||
                    !resolvedBy.trim()
                )
            ) {
                return req.reject(
                    400,
                    'Resolution remarks and resolver name are required.'
                );
            }

            // Enforce sequential resolution transitions.
            if (
                normalizedStatus !== exception.resolutionStatus &&
                NEXT_RESOLUTION_STATUS[exception.resolutionStatus] !==
                    normalizedStatus
            ) {
                return req.reject(
                    400,
                    `Invalid exception transition from ${exception.resolutionStatus} to ${normalizedStatus}.`
                );
            }

            const timestamp = now();

            const updates = {
                resolutionStatus: normalizedStatus
            };

            if (resolutionRemarks !== undefined) {
                updates.resolutionRemarks =
                    typeof resolutionRemarks === 'string'
                        ? resolutionRemarks.trim()
                        : resolutionRemarks;
            }

            if (normalizedStatus === 'Resolved') {
                updates.resolvedDate = timestamp;
                updates.resolvedBy = resolvedBy.trim();
                updates.resolutionRemarks = resolutionRemarks.trim();
            }

            await tx.run(
                UPDATE(ShipmentExceptions)
                    .set(updates)
                    .where({ ID: exceptionID })
            );

            await recordAudit(tx, {
                shipment_ID: exception.shipment_ID,
                exception_ID: exceptionID,
                eventType: 'ExceptionUpdated',
                fieldName: 'resolutionStatus',
                oldValue: exception.resolutionStatus,
                newValue: normalizedStatus,
                remarks:
                    resolutionRemarks?.trim() ||
                    'Exception status updated'
            });

            // Check whether other investigation exceptions remain open.
            const allExceptions = await tx.run(
                SELECT.from(ShipmentExceptions)
                    .where({
                        shipment_ID: exception.shipment_ID
                    })
            );

            const unresolvedInvestigation = allExceptions.some(item =>
                item.ID !== exceptionID &&
                ['Lost', 'Damaged', 'AddressIssue'].includes(
                    item.exceptionType
                ) &&
                item.resolutionStatus !== 'Resolved'
            );

            if (
                ['Lost', 'Damaged', 'AddressIssue'].includes(
                    exception.exceptionType
                ) &&
                normalizedStatus === 'Resolved' &&
                !unresolvedInvestigation
            ) {
                await tx.run(
                    UPDATE(Shipments)
                        .set({ investigationRequired: false })
                        .where({ ID: exception.shipment_ID })
                );
            }

            return await tx.run(
                SELECT.one.from(ShipmentExceptions)
                    .where({ ID: exceptionID })
            );
        };

        // Unbound action: exceptionID is supplied in req.data.
        this.on('updateException', handleUpdateException);

        // Bound action: exception ID comes from the bound record.
        this.on('updateResolution', 'ShipmentExceptions', async req => {
            const exceptionID = req.params?.[0]?.ID;

            if (!exceptionID) {
                return req.reject(
                    400,
                    'Exception ID is required.'
                );
            }

            req.data.exceptionID = exceptionID;

            return handleUpdateException(req);
        });


        // --------------------------------------------------
        // 6. Record an unsuccessful delivery attempt
        // --------------------------------------------------

        this.on('recordDeliveryAttempt', async req => {
            const { shipmentID, location, remarks } = req.data;

            if (!shipmentID) {
                return req.reject(
                    400,
                    'Shipment ID is required.'
                );
            }

            if (
                location !== undefined &&
                (
                    typeof location !== 'string' ||
                    !location.trim()
                )
            ) {
                return req.reject(
                    400,
                    'Delivery attempt location cannot be empty.'
                );
            }

            const tx = cds.tx(req);

            const shipment = await tx.run(
                SELECT.one.from(Shipments)
                    .where({ ID: shipmentID })
            );

            if (!shipment) {
                return req.reject(404, 'Shipment not found.');
            }

            if (shipment.shipmentStatus !== 'OutForDelivery') {
                return req.reject(
                    400,
                    'Delivery attempts can only be recorded when the shipment is OutForDelivery.'
                );
            }

            const timestamp = now();
            const count = (shipment.deliveryAttemptCount || 0) + 1;

            const updatedLocation =
                location !== undefined
                    ? location.trim()
                    : shipment.currentLocation || null;

            await tx.run(
                UPDATE(Shipments)
                    .set({
                        deliveryAttemptCount: count,
                        lastTrackingUpdate: timestamp,
                        currentLocation: updatedLocation
                    })
                    .where({ ID: shipmentID })
            );

            await recordHistory(tx, {
                shipment_ID: shipmentID,
                previousLocation: shipment.currentLocation,
                currentLocation: updatedLocation,
                previousStatus: shipment.shipmentStatus,
                newStatus: shipment.shipmentStatus,
                eventType: 'DeliveryAttempt',
                eventDateTime: timestamp,
                remarks: remarks || 'Delivery attempt unsuccessful',
                updatedBy: 'system'
            });

            await recordAudit(tx, {
                shipment_ID: shipmentID,
                eventType: 'ShipmentUpdated',
                fieldName: 'deliveryAttemptCount',
                oldValue: String(shipment.deliveryAttemptCount || 0),
                newValue: String(count),
                remarks: remarks || 'Delivery attempt recorded'
            });

            return await tx.run(
                SELECT.one.from(Shipments)
                    .where({ ID: shipmentID })
            );
        });

        // --------------------------------------------------
        // 7. Calculate dashboard KPI counts
        // --------------------------------------------------

        this.on('getDashboardKPIs', async req => {
            const tx = cds.tx(req);

            const shipments = await tx.run(
                SELECT.from(Shipments)
            );

            const exceptions = await tx.run(
                SELECT.from(ShipmentExceptions)
            );

            const currentTime = now();

            return {
                totalShipments: shipments.length,

                deliveredShipments: shipments.filter(
                    shipment =>
                        shipment.shipmentStatus === 'Delivered'
                ).length,

                delayedShipments: shipments.filter(
                    shipment =>
                        shipment.shipmentStatus !== 'Delivered' &&
                        shipment.eta &&
                        new Date(shipment.eta) < currentTime
                ).length,

                openExceptions: exceptions.filter(
                    exception =>
                        exception.resolutionStatus !== 'Resolved'
                ).length,

                criticalExceptions: exceptions.filter(
                    exception =>
                        exception.severity === 'Critical' &&
                        exception.resolutionStatus !== 'Resolved'
                ).length
            };
        });

        // --------------------------------------------------
        // 8. Return delayed shipments
        // --------------------------------------------------

        this.on('getDelayedShipments', async req => {
            const tx = cds.tx(req);

            const shipments = await tx.run(
                SELECT.from(Shipments)
            );

            const currentTime = now();

            return shipments.filter(shipment =>
                shipment.shipmentStatus !== 'Delivered' &&
                shipment.eta &&
                new Date(shipment.eta) < currentTime
            );
        });

        // --------------------------------------------------
        // 9. Make tracking history immutable
        // --------------------------------------------------

        this.before(
            ['UPDATE', 'DELETE'],
            'TrackingHistory',
            req => {
                return req.reject(
                    405,
                    'Tracking history records cannot be modified or deleted.'
                );
            }
        );

        // --------------------------------------------------
        // 10. Make audit logs immutable
        // --------------------------------------------------

        this.before(
            ['UPDATE', 'DELETE'],
            'ShipmentAuditLogs',
            req => {
                return req.reject(
                    405,
                    'Audit log records cannot be modified or deleted.'
                );
            }
        );

        // --------------------------------------------------
        // 11. Prevent direct exception modifications
        // --------------------------------------------------

        this.before(
            ['UPDATE', 'DELETE'],
            'ShipmentExceptions',
            req => {
                return req.reject(
                    405,
                    'Use the updateException action to manage exception resolution. Exceptions cannot be directly edited or deleted.'
                );
            }
        );

        return super.init();
    }
}

export default ShipmentService;
