/* eslint-disable react/prop-types */
import update from "immutability-helper";
import { fromPairs, isEqual, partition, pick } from "lodash";
import { useCallback, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce/lib";

export const DEBOUNCED_BATCH_TIMEOUT = 500;
const LOCKED_FLAG_KEY = "locked";

export function isUpdateNeeded(original, itemUpdate) {
  if (typeof original.id !== "string" || typeof itemUpdate.id !== "string") {
    throw new Error("Passed ID that is not a string");
  }

  const fieldsToOmit = [LOCKED_FLAG_KEY];
  const keysToCompare = Object.keys(itemUpdate).filter(
    (key) => ![...fieldsToOmit, "id"].includes(key)
  );

  return !isEqual(
    pick(original, keysToCompare),
    pick(itemUpdate, keysToCompare)
  );
}

function addLockedFlagToPhotos(photos) {
  return photos.map((photo) => ({ ...photo, [LOCKED_FLAG_KEY]: false }));
}

function hasPendingUpdates(batchUpdates) {
  return Object.keys(batchUpdates).length > 0;
}

export function usePhotos({ photos: initialPhotos = [], onUpdate }) {
  const [photos, setPhotos] = useState(addLockedFlagToPhotos(initialPhotos));
  const [pendingUpdates, setPendingUpdates] = useState({});

  const removePhotosLockedFlag = useCallback(
    (_pendingUpdates) =>
      setPhotos((_photos) =>
        _photos.map((photo) => {
          const updatedItem = _pendingUpdates[photo.id];
          if (updatedItem) {
            return Object.assign({}, photo, {
              [LOCKED_FLAG_KEY]: false,
            });
          }

          return photo;
        })
      ),
    [setPhotos]
  );

  const revertPhotosToOriginalState = useCallback(
    (originalPhotos) =>
      setPhotos((_photos) =>
        _photos.map((item) => {
          const originalItem =
            originalPhotos.find((photo) => photo.id === item.id) || item;

          return Object.assign({}, originalItem, { [LOCKED_FLAG_KEY]: false });
        })
      ),
    [setPhotos]
  );

  const applyUpdatesToPhotos = useCallback(
    (_pendingUpdates) =>
      setPhotos((_photos) =>
        _photos.map((photo) => {
          const batchUpdateItem = _pendingUpdates[photo.id];

          if (batchUpdateItem) {
            // Locked flag will indicate that item is being processed now
            // (sent in an API request and waiting for a response)
            return Object.assign({}, photo, batchUpdateItem, {
              [LOCKED_FLAG_KEY]: true,
            });
          }
          return photo;
        })
      ),
    [setPhotos]
  );

  const clearPendingUpdates = useCallback(() => setPendingUpdates({}), [
    setPendingUpdates,
  ]);

  const getItemsToResetAndUpdate = useCallback(
    (itemsUpdates, originalPhotos) => {
      const originalPhotosLookup = fromPairs(
        originalPhotos.map((originalPhoto) => [originalPhoto.id, originalPhoto])
      );
      function getOriginalPhoto(id) {
        return originalPhotosLookup[id];
      }

      const [toUpdate, toReset] = partition(itemsUpdates, (itemUpdate) => {
        const originalPhoto = getOriginalPhoto(itemUpdate.id);

        return isUpdateNeeded(originalPhoto, itemUpdate);
      });

      return {
        toReset: toReset.map((item) => item.id),
        toUpdate: fromPairs(toUpdate.map((item) => [item.id, item])),
      };
    },
    []
  );

  const performUpdates = useDebouncedCallback(
    async () => {
      if (!hasPendingUpdates(pendingUpdates)) {
        return;
      }

      clearPendingUpdates();
      applyUpdatesToPhotos(pendingUpdates);

      try {
        const pendingUpdatesList = Object.keys(pendingUpdates);

        await onUpdate(pendingUpdatesList);

        removePhotosLockedFlag(pendingUpdates);
      } catch (exception) {
        revertPhotosToOriginalState(photos);
      }
    },
    DEBOUNCED_BATCH_TIMEOUT,
    { maxWait: 2500 }
  );

  const updatePhotos = useCallback(
    (itemsUpdates) => {
      const { toReset, toUpdate } = getItemsToResetAndUpdate(
        itemsUpdates,
        photos
      );

      setPendingUpdates(
        update(pendingUpdates, {
          $unset: toReset,
          $merge: toUpdate,
        })
      );

      performUpdates.callback();
    },
    [
      photos,
      pendingUpdates,
      setPendingUpdates,
      performUpdates,
      getItemsToResetAndUpdate,
    ]
  );

  const currentPhotos = useMemo(() => {
    return photos.map((photo) =>
      Object.assign({}, photo, pendingUpdates[photo.id] || {})
    );
  }, [photos, pendingUpdates]);

  return {
    updatePhotos,
    pendingUpdates,
    photos: currentPhotos,
  };
}
