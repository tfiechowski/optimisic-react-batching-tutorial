/* eslint-disable react/prop-types */
import update from "immutability-helper";
import { isEqual, omit } from "lodash";
import { useCallback, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce/lib";

export const DEBOUNCED_BATCH_TIMEOUT = 500;

function areEqual(original, updated) {
  const fieldsToOmit = ["pending"];
  return isEqual(omit(original, fieldsToOmit), omit(updated, fieldsToOmit));
}

function getPhotosToUpdate(photos, batchUpdates) {
  function getPhoto(id) {
    return photos.find((photo) => photo.id === id);
  }

  return Object.values(batchUpdates)
    .map((batchUpdate) => {
      const original = getPhoto(batchUpdate.id);

      if (areEqual(original, batchUpdate)) {
        return null;
      }

      return batchUpdate;
    })
    .filter((item) => item !== null);
}

export function usePhotos({ photos: initialPhotos = [], onUpdate }) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [batchUpdates, setBatchUpdates] = useState({});

  const resetPendingPhotos = useCallback(
    (_batchUpdates) => {
      setPhotos((_photos) =>
        _photos.map((photo) => {
          const item = _batchUpdates[photo.id] || photo;

          return Object.assign({}, item, { pending: false });
        })
      );
    },
    [setPhotos]
  );

  const revertPhotosToOriginalState = useCallback(
    (photosSnapshot) => {
      setPhotos((_photos) => {
        return _photos.map((item) => {
          const originalItem =
            photosSnapshot.find((photo) => photo.id === item.id) || item;

          return Object.assign({}, originalItem, { pending: false });
        });
      });
    },
    [setPhotos]
  );

  const updateItems = useCallback(
    (_batchUpdates) => {
      setPhotos((_photos) => {
        const resultPhotos = _photos.map((photo) => {
          const key = photo.id;
          const batchUpdateItem = _batchUpdates[key];

          if (batchUpdateItem) {
            // Pending will be used to block the item from clicking on it again
            return Object.assign({}, batchUpdateItem, { pending: true });
          }
          return photo;
        });

        return resultPhotos;
      });
    },
    [setPhotos]
  );

  const getItemsToResetAndUpdate = useCallback((items, _photos) => {
    return items.reduce(
      (acc, item) => {
        const key = item.id;
        const originalPhoto = _photos.find((photo) => photo.id === item.id);

        if (areEqual(originalPhoto, item)) {
          return update(acc, { toReset: { $push: [key] } });
        }

        const updatedItem = Object.assign({}, originalPhoto, item);

        return update(acc, {
          toUpdate: {
            [key]: { $set: updatedItem },
          },
        });
      },
      { toReset: [], toUpdate: {} }
    );
  }, []);

  const updatePhotosDebounced = useDebouncedCallback(
    async () => {
      if (Object.keys(batchUpdates).length === 0) {
        return;
      }

      setBatchUpdates((_batchUpdates) =>
        update(_batchUpdates, {
          $unset: Object.keys(batchUpdates),
        })
      );

      updateItems(batchUpdates);

      // Calling the API
      try {
        const photosToUpdate = getPhotosToUpdate(photos, batchUpdates);

        await onUpdate(photosToUpdate);

        // Reset pending
        resetPendingPhotos(batchUpdates);
      } catch (exception) {
        revertPhotosToOriginalState(photos);
      }
    },
    DEBOUNCED_BATCH_TIMEOUT,
    { maxWait: 2500 }
  );

  const handleMultipleChange = useCallback(
    (items) => {
      const { toReset, toUpdate } = getItemsToResetAndUpdate(items, photos);

      setBatchUpdates(
        update(batchUpdates, {
          $unset: toReset,
          $merge: toUpdate,
        })
      );

      updatePhotosDebounced.callback();
    },
    [
      photos,
      batchUpdates,
      setBatchUpdates,
      updatePhotosDebounced,
      getItemsToResetAndUpdate,
    ]
  );

  const currentPhotos = useMemo(() => {
    return photos.map((photo) => {
      const key = photo.id;

      return Object.assign({}, batchUpdates[key] || photo);
    });
  }, [photos, batchUpdates]);

  return {
    handleEdit: handleMultipleChange,
    batchUpdates,
    photos: currentPhotos,
  };
}
