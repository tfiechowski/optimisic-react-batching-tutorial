/* eslint-disable react/prop-types */
import update from "immutability-helper";
import { isEqual, omit } from "lodash";
import { useCallback, useState } from "react";
import { useDebouncedCallback } from "use-debounce/lib";

const DEBOUNCED_BATCH_TIMEOUT = 500;

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

      setPhotos((_photos) => {
        const resultPhotos = _photos.map((photo) => {
          const key = photo.id;
          const batchUpdateItem = batchUpdates[key];

          if (batchUpdateItem) {
            // Pending will be used to block the item from clicking on it again
            return Object.assign({}, batchUpdateItem, { pending: true });
          }
          return photo;
        });

        return resultPhotos;
      });

      // Calling the API
      try {
        const photosToUpdate = getPhotosToUpdate(photos, batchUpdates);
        
        await onUpdate(photosToUpdate);
        
        // Reset pending
        setPhotos((_photos) =>
          _photos.map((photo) => {
            const item = batchUpdates[photo.id] || photo;

            return Object.assign({}, item, { pending: false });
          })
        );
      } catch (exception) {
        setPhotos((_photos) => {
          return _photos.map((item) => {
            const originalItem =
            photos.find((photo) => photo.id === item.id) || item;

            return Object.assign({}, originalItem, { pending: false });
          });
        });
      }
    },
    DEBOUNCED_BATCH_TIMEOUT,
    { maxWait: 2500 }
  );

  const handleMultipleChange = useCallback(
    (items) => {
      const { toReset, toUpdate } = items.reduce(
        (acc, item) => {
          const key = item.id;
          const originalPhoto = photos.find((photo) => photo.id === item.id);

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


      setBatchUpdates(
        update(batchUpdates, {
          $unset: toReset,
          $merge: toUpdate,
        })
      );

      updatePhotosDebounced.callback();
    },
    [photos, batchUpdates, setBatchUpdates, updatePhotosDebounced]
  );

  return {
    handleEdit: handleMultipleChange,
    batchUpdates,
    photos,
  };
}
