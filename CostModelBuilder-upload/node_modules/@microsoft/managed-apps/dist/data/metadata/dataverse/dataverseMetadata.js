/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 */
const entityClusterModeEnum = {
    0: 'Partitioned',
    1: 'Replicated',
    2: 'Local',
};
export function getEntityClusterModeName(value) {
    return entityClusterModeEnum[value];
}
const ownershipTypeEnum = {
    0: 'None',
    1: 'UserOwned',
    2: 'TeamOwned',
    4: 'BusinessOwned',
    8: 'OrganizationOwned',
    16: 'BusinessParented',
    32: 'Filtered',
};
export function getOwnershipTypeName(value) {
    return ownershipTypeEnum[value];
}
const privilegeTypeEnum = {
    0: 'None',
    1: 'Create',
    2: 'Read',
    3: 'Write',
    4: 'Delete',
    5: 'Assign',
    6: 'Share',
    7: 'Append',
    8: 'AppendTo',
};
export function getPrivilegeTypeName(value) {
    return privilegeTypeEnum[value];
}
const attributeTypeCodeEnum = {
    0: 'Boolean',
    1: 'Customer',
    2: 'DateTime',
    3: 'Decimal',
    4: 'Double',
    5: 'Integer',
    6: 'Lookup',
    7: 'Memo',
    8: 'Money',
    9: 'Owner',
    10: 'PartyList',
    11: 'Picklist',
    12: 'State',
    13: 'Status',
    14: 'String',
    15: 'Uniqueidentifier',
    16: 'CalendarRules',
    17: 'Virtual',
    18: 'BigInt',
    19: 'ManagedProperty',
    20: 'EntityName',
};
export function getAttributeTypeCodeName(value) {
    return attributeTypeCodeEnum[value];
}
const attributeRequiredLevelEnum = {
    0: 'None',
    1: 'SystemRequired',
    2: 'ApplicationRequired',
    3: 'Recommended',
};
export function getAttributeRequiredLevelName(value) {
    return attributeRequiredLevelEnum[value];
}
const relationshipTypeEnum = {
    0: 'OneToManyRelationship',
    1: 'ManyToManyRelationship',
};
export function getRelationshipTypeName(value) {
    return relationshipTypeEnum[value];
}
const securityTypesEnum = {
    0: 'None', // No security privileges are checked during create or update operations.
    1: 'Append', // The Append and AppendTo privileges are checked for create or update operations.
    2: 'ParentChild', // Security for the referencing entity record is derived from the referenced entity record.
    8: 'Pointer', // Security for the referencing entity record is derived from a pointer record.
    16: 'Inheritance', // The referencing entity record inherits security from the referenced security record.
};
export function getSecurityTypesName(value) {
    return securityTypesEnum[value];
}
const associatedMenuBehaviorEnum = {
    0: 'UseCollectionName',
    1: 'UseLabel',
    2: 'DoNotDisplay',
};
export function getAssociatedMenuBehaviorName(value) {
    return associatedMenuBehaviorEnum[value];
}
const associatedMenuGroupEnum = {
    0: 'Details',
    1: 'Sales',
    2: 'Service',
    3: 'Marketing',
};
export function getAssociatedMenuGroupName(value) {
    return associatedMenuGroupEnum[value];
}
const cascadeTypeEnum = {
    0: 'NoCascade', // Do nothing.
    1: 'Cascade', // Perform the action on all referencing entity records associated with the referenced entity record.
    2: 'Active', //	Perform the action on all active referencing entity records associated with the referenced entity record.
    3: 'UserOwned', // Perform the action on all referencing entity records owned by the same user as the referenced entity record.
    4: 'RemoveLink', // Remove the value of the referencing attribute for all referencing entity records associated with the referenced entity record.
    5: 'Restrict', // Prevent the Referenced entity record from being deleted when referencing entities exist.
};
export function getCascadeTypeName(value) {
    return cascadeTypeEnum[value];
}
//# sourceMappingURL=dataverseMetadata.js.map