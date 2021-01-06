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

function getPhotosToUpdate(photos, itemUpdates) {
  function getPhoto(id) {
    return photos.find((photo) => photo.id === id);
  }

  return Object.values(itemUpdates)
    .map((itemUpdate) => {
      const original = getPhoto(itemUpdate.id);

      if (!isUpdateNeeded(original, itemUpdate)) {
        return null;
      }

      return itemUpdate;
    })
    .filter((item) => item !== null);
}

function addPendingFlagToPhotos(photos) {
  return photos.map((photo) => ({ ...photo, [LOCKED_FLAG_KEY]: false }));
}

function hasPendingUpdates(batchUpdates) {
  return Object.keys(batchUpdates).length > 0;
}

export function usePhotos({ photos: initialPhotos = [], onUpdate }) {
  const [photos, setPhotos] = useState(addPendingFlagToPhotos(initialPhotos));
  const [pendingUpdates, setPendingUpdates] = useState({});

  const resetPendingPhotos = useCallback(
    (_pendingUpdates) => {
      setPhotos((_photos) =>
        _photos.map((photo) => {
          const updatedItem = _pendingUpdates[photo.id];
          if (updatedItem) {
            return Object.assign({}, updatedItem, {
              [LOCKED_FLAG_KEY]: false,
            });
          }

          return photo;
        })
      );
    },
    [setPhotos]
  );

  const revertPhotosToOriginalState = useCallback(
    (originalPhotos) => {
      setPhotos((_photos) =>
        _photos.map((item) => {
          const originalItem =
            originalPhotos.find((photo) => photo.id === item.id) || item;

          return Object.assign({}, originalItem, { [LOCKED_FLAG_KEY]: false });
        })
      );
    },
    [setPhotos]
  );

  const applyUpdatesToPhotos = useCallback(
    (_pendingUpdates) => {
      setPhotos((_photos) =>
        _photos.map((photo) => {
          const batchUpdateItem = _pendingUpdates[photo.id];

          if (batchUpdateItem) {
            // Locked flag will indicate that item is being processed now
            // (sent in an API request and waiting for a response)
            return Object.assign({}, batchUpdateItem, {
              [LOCKED_FLAG_KEY]: true,
            });
          }
          return photo;
        })
      );
    },
    [setPhotos]
  );

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
        toUpdate: fromPairs(
          toUpdate
            .map((item) => {
              const originalPhoto = getOriginalPhoto(item.id);
              const updatedItem = Object.assign({}, originalPhoto, item);
              return updatedItem;
            })
            .map((item) => [item.id, item])
        ),
      };
    },
    []
  );

  const clearPendingUpdates = useCallback(
    (pendingUpdateKeys) => {
      setPendingUpdates((_pendingUpdates) =>
        update(_pendingUpdates, {
          $unset: pendingUpdateKeys,
        })
      );
    },
    [setPendingUpdates]
  );

  const performUpdates = useDebouncedCallback(
    async () => {
      if (!hasPendingUpdates(pendingUpdates)) {
        return;
      }

      clearPendingUpdates(Object.keys(pendingUpdates));
      applyUpdatesToPhotos(pendingUpdates);

      try {
        const photosToUpdate = getPhotosToUpdate(photos, pendingUpdates);

        await onUpdate(photosToUpdate);

        resetPendingPhotos(pendingUpdates);
      } catch (exception) {
        revertPhotosToOriginalState(photos);
      }
    },
    DEBOUNCED_BATCH_TIMEOUT,
    { maxWait: 2500 }
  );

  const handleUpdatePhotos = useCallback(
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
      Object.assign({}, pendingUpdates[photo.id] || photo)
    );
  }, [photos, pendingUpdates]);

  return {
    updatePhotos: handleUpdatePhotos,
    pendingUpdates,
    photos: currentPhotos,
  };
}
