import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedGestureHandler, useSharedValue, useAnimatedReaction, runOnJS } from 'react-native-reanimated';

import style from './style';
import Column from './components/column';
import Repository from './handlers/repository';
import Utils from './commons/utils';

const SCROLL_THRESHOLD = 50;
const SCROLL_STEP = 8;

const DraggableBoard = ({
                          repository,
                          renderColumnWrapper,
                          renderRow,
                          columnWidth,
                          accessoryRight,
                          activeRowStyle,
                          activeRowRotation = 8,
                          xScrollThreshold = SCROLL_THRESHOLD,
                          yScrollThreshold = SCROLL_THRESHOLD,
                          dragSpeedFactor = 1,
                          onRowPress = () => { },
                          onDragStart = () => { },
                          onDragEnd = () => { },
                          style: boardStyle,
                          horizontal = true,
                        }) => {
  const [forceUpdate, setForceUpdate] = useState(false);
  const [hoverComponent, setHoverComponent] = useState(null);
  const [movingMode, setMovingMode] = useState(false);

  let translateX = useSharedValue(0);
  let translateY = useSharedValue(0);

  let absoluteX = useSharedValue(0);
  let absoluteY = useSharedValue(0);

  const scrollViewRef = useRef();
  const scrollOffset = useRef(0);
  const hoverRowItem = useRef();

  useEffect(() => {
    repository.setReload(() => setForceUpdate(prevState => !prevState));
  }, [repository]);

  const panGesture1 = Gesture.Pan()
      .onStart(()=>{})
      .onUpdate((event)=>{
        translateX.value = event.translationX;
        translateY.value = event.translationY;
        absoluteX.value = event.absoluteX;
        absoluteY.value = event.absoluteY;
      })
      .onEnd((event)=>{
        if (movingMode) {
          runOnJS(setHoverComponent)(null);
          runOnJS(setMovingMode)(false);
          translateX.value = 0;
          translateY.value = 0;
          absoluteX.value = 0;
          absoluteY.value = 0;
          runOnJS(repository.updateOriginalData)();
          runOnJS(repository.showRow)(hoverRowItem.current);
          hoverRowItem.current = null;
          if (onDragEnd) {
            runOnJS(onDragEnd)(
                hoverRowItem.current.oldColumnId,
                hoverRowItem.current.columnId,
                hoverRowItem.current,
            );
          }
        }
      })
  const panGesture = useAnimatedGestureHandler({
    onStart: (event, ctx) => {
      // Handle gesture start if necessary
    },
    onActive: (event, ctx) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      absoluteX.value = event.absoluteX;
      absoluteY.value = event.absoluteY;
    },
    onEnd: (event, ctx) => {
      if (movingMode) {
        runOnJS(setHoverComponent)(null);
        runOnJS(setMovingMode)(false);
        translateX.value = 0;
        translateY.value = 0;
        absoluteX.value = 0;
        absoluteY.value = 0;
        runOnJS(repository.updateOriginalData)();
        runOnJS(repository.showRow)(hoverRowItem.current);
        hoverRowItem.current = null;
        if (onDragEnd) {
          runOnJS(onDragEnd)(
              hoverRowItem.current.oldColumnId,
              hoverRowItem.current.columnId,
              hoverRowItem.current,
          );
        }
      }
    },
  });

  const listenRowChangeColumn = (fromColumnId, toColumnId) => {
    hoverRowItem.current.columnId = toColumnId;
    hoverRowItem.current.oldColumnId = fromColumnId;
  };

  useAnimatedReaction(
      () => movingMode,
      (mode) => {
        if (mode) {
          runOnJS(handleRowPosition)([absoluteX.value, absoluteY.value]);
        }
      },
  );

  useAnimatedReaction(
      () => movingMode,
      (mode) => {
        if (mode) {
          runOnJS(handleColumnPosition)([translateX.value, translateY.value]);
        }
      },
  );

  const handleRowPosition = ([x, y]) => {
    if (hoverRowItem.current && (x || y)) {
      const columnAtPosition = repository.moveRow(
          hoverRowItem.current,
          x,
          y,
          listenRowChangeColumn,
      );

      if (columnAtPosition && scrollViewRef.current) {
        // handle scroll horizontal
        if (x + xScrollThreshold > Utils.deviceWidth) {
          scrollOffset.current += SCROLL_STEP;
          scrollViewRef.current.scrollTo({
            x: scrollOffset.current * dragSpeedFactor,
            y: 0,
            animated: true
          });
          repository.measureColumnsLayout();
        } else if (x < xScrollThreshold) {
          scrollOffset.current -= SCROLL_STEP;
          scrollViewRef.current.scrollTo({
            x: scrollOffset.current / dragSpeedFactor,
            y: 0,
            animated: true
          });
          repository.measureColumnsLayout();
        }
      }
    }
  };

  const handleColumnPosition = ([x, y]) => {
    // Implement column position handling logic if needed
  };

  const onScroll = event => {
    scrollOffset.current = event.nativeEvent.contentOffset.x;
  };

  const onScrollEnd = event => {
    scrollOffset.current = event.nativeEvent.contentOffset.x;
    repository.measureColumnsLayout();
  };

  const keyExtractor = useCallback(
      (item, index) => `${item.id}${item.name}${index}`,
      [],
  );

  const renderHoverComponent = () => {
    if (hoverComponent && hoverRowItem.current) {
      const row = repository.findRow(hoverRowItem.current);
      if (row && row.layout) {
        const { x, y, width, height } = row.layout;
        const hoverStyle = [
          style.hoverComponent,
          activeRowStyle,
          {
            transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { rotate: `${activeRowRotation}deg` }],
          },
          {
            top: y - yScrollThreshold,
            left: x,
            width,
            height,
          },
        ];

        return (
            <Animated.View style={hoverStyle}>{hoverComponent}</Animated.View>
        );
      }
    }
  };

  const moveItem = async (hoverItem, rowItem, isColumn = false) => {
    rowItem.setHidden(true);
    repository.hideRow(rowItem);
    await rowItem.measureLayout();
    hoverRowItem.current = { ...rowItem };

    setMovingMode(true);
    setHoverComponent(hoverItem);
  };

  const drag = column => {
    const hoverColumn = renderColumnWrapper({
      move: moveItem,
      item: column.data,
      index: column.index,
    });
    moveItem(hoverColumn, column, true);
  };

  const renderColumns = () => {
    const columns = repository.getColumns();
    return columns.map((column, index) => {
      const key = keyExtractor(column, index);

      const columnComponent = (
          <Column
              repository={repository}
              column={column}
              move={moveItem}
              renderColumnWrapper={renderColumnWrapper}
              keyExtractor={keyExtractor}
              renderRow={renderRow}
              scrollEnabled={!movingMode}
              columnWidth={columnWidth}
              onRowPress={onRowPress}
              onDragStartCallback={onDragStart}
          />
      );

      return renderColumnWrapper({
        item: column.data,
        index: column.index,
        columnComponent,
        drag: () => drag(column),
        layoutProps: {
          key,
          ref: ref => repository.updateColumnRef(column.id, ref),
          onLayout: layout => repository.updateColumnLayout(column.id),
        },
      });
    });
  };

  return (
      <GestureDetector gesture={panGesture1}>
        <Animated.View style={[style.container, boardStyle]}>
          <ScrollView
              ref={scrollViewRef}
              scrollEnabled={!movingMode}
              horizontal={horizontal}
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={onScroll}
              onScrollEndDrag={onScrollEnd}
              onMomentumScrollEnd={onScrollEnd}>
            {renderColumns()}
            {Utils.isFunction(accessoryRight) ? accessoryRight() : accessoryRight}
          </ScrollView>
          {renderHoverComponent()}
        </Animated.View>
      </GestureDetector>
  );
};

export default DraggableBoard;
export { Repository };
