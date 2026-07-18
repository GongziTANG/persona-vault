# Recovery

## Interrupted connector

Resume the platform connector from its checkpoint. Do not import a connector with an unresolved active run as a completed source. Re-importing after recovery is safe and idempotent.

## Identity mismatch

Stop when the stored UID, original ID, or PersonaVault person ID differs from the requested target. Create a separate vault or obtain explicit migration approval; never overwrite identity evidence.

## Platform count gap

Record both reported and accessible counts. A visible terminal page plus successfully checkpointed preceding pages proves accessible completion, not recovery of deleted or access-restricted history.

## Edited content

Keep the same global ID, update the canonical item, preserve `firstCapturedAt`, and record the new import run. Do not create a duplicate item.

## Broken unified output

Keep connector archives unchanged. Rerun the relevant `personavault import` command, then `personavault verify`. The unified vault is derived from connector artifacts and can be rebuilt without logging in again.
