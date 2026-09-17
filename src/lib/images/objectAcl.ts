import {
  S3Client,
  HeadObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";

// ---------------------------------------------------------------------------
// S3 object reference — replaces the GCS File object
// ---------------------------------------------------------------------------

export interface S3ObjectRef {
  bucket: string;
  key: string;
}

// ---------------------------------------------------------------------------
// ACL types
// ---------------------------------------------------------------------------

// Can be flexibly extended per use case.
// Examples:
//   USER_LIST   — users from a list stored in the database
//   EMAIL_DOMAIN — users whose email matches a specific domain
//   GROUP_MEMBER — members of a specific group
//   SUBSCRIBER   — subscribers of a specific service / content creator
export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  /** Logic ID that identifies group members. Format depends on the type. */
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

/** Stored as S3 user metadata under the key defined by ACL_METADATA_KEY. */
export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

// ---------------------------------------------------------------------------
// S3 client — same lazy-singleton pattern as objectStorage.ts
// ---------------------------------------------------------------------------

/** S3 user-metadata key that stores the serialised ObjectAclPolicy. */
const ACL_METADATA_KEY = "acl-policy";

let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
      ...(process.env.AWS_ACCESS_KEY_ID
        ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY ?? process.env.AWS_API_KEY)!,
            },
          }
        : {}),
    });
  }
  return _s3;
}

// ---------------------------------------------------------------------------
// Access-group helpers
// ---------------------------------------------------------------------------

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission
): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string
  ) {}

  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(
  group: ObjectAccessGroup
): BaseObjectAccessGroup {
  switch (group.type) {
    // Add cases here as you implement access group types, e.g.:
    // case ObjectAccessGroupType.USER_LIST:
    //   return new UserListAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

// ---------------------------------------------------------------------------
// ACL persistence — stored as S3 user metadata on the object itself.
// S3 doesn't allow in-place metadata updates, so setObjectAclPolicy copies
// the object to itself with MetadataDirective: REPLACE.
// ---------------------------------------------------------------------------

export async function setObjectAclPolicy(
  objectRef: S3ObjectRef,
  aclPolicy: ObjectAclPolicy
): Promise<void> {
  const s3 = getS3();

  // Read existing metadata so we don't lose it on the copy
  const head = await s3.send(
    new HeadObjectCommand({ Bucket: objectRef.bucket, Key: objectRef.key })
  );

  await s3.send(
    new CopyObjectCommand({
      Bucket: objectRef.bucket,
      Key: objectRef.key,
      CopySource: `${objectRef.bucket}/${objectRef.key}`,
      MetadataDirective: "REPLACE",
      ContentType: head.ContentType,
      Metadata: {
        ...head.Metadata,
        [ACL_METADATA_KEY]: JSON.stringify(aclPolicy),
      },
    })
  );
}

export async function getObjectAclPolicy(
  objectRef: S3ObjectRef
): Promise<ObjectAclPolicy | null> {
  const s3 = getS3();
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: objectRef.bucket, Key: objectRef.key })
    );
    const raw = head.Metadata?.[ACL_METADATA_KEY];
    if (!raw) return null;
    return JSON.parse(raw) as ObjectAclPolicy;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Access check
// ---------------------------------------------------------------------------

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: S3ObjectRef;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) return false;

  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) return false;
  if (aclPolicy.owner === userId) return true;

  for (const rule of aclPolicy.aclRules ?? []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
