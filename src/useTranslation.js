import { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { getI18n, getDefaults, ReportNamespaces, I18nContext } from './context.js';
import { warnOnce, loadNamespaces, loadLanguages, hasLoadedNamespace } from './utils.js';

const usePrevious = (value, ignore) => {
  const ref = useRef();
  useEffect(() => {
    ref.current = ignore ? ref.current : value;
  }, [value, ignore]);
  return ref.current;
};

function alwaysNewT(i18n, language, namespace, keyPrefix) {
  return i18n.getFixedT(language, namespace, keyPrefix);
}

function useMemoizedT(i18n, language, namespace, keyPrefix) {
  return useCallback(alwaysNewT(i18n, language, namespace, keyPrefix), [
    i18n,
    language,
    namespace,
    keyPrefix,
  ]);
}

export function useTranslation(ns, props = {}) {
  // assert we have the needed i18nInstance
  const { i18n: i18nFromProps } = props;
  const { i18n: i18nFromContext, defaultNS: defaultNSFromContext } = useContext(I18nContext) || {};
  const i18n = i18nFromProps || i18nFromContext || getI18n();
  if (i18n && !i18n.reportNamespaces) i18n.reportNamespaces = new ReportNamespaces();
  if (!i18n) {
    warnOnce('You will need to pass in an i18next instance by using initReactI18next');
    const notReadyT = (k, optsOrDefaultValue) => {
      if (typeof optsOrDefaultValue === 'string') return optsOrDefaultValue;
      if (
        optsOrDefaultValue &&
        typeof optsOrDefaultValue === 'object' &&
        typeof optsOrDefaultValue.defaultValue === 'string'
      )
        return optsOrDefaultValue.defaultValue;
      return Array.isArray(k) ? k[k.length - 1] : k;
    };
    const retNotReady = [notReadyT, {}, false];
    retNotReady.t = notReadyT;
    retNotReady.i18n = {};
    retNotReady.ready = false;
    return retNotReady;
  }

  if (i18n.options.react && i18n.options.react.wait !== undefined)
    warnOnce(
      'It seems you are still using the old wait option, you may migrate to the new useSuspense behaviour.',
    );

  const i18nOptions = { ...getDefaults(), ...i18n.options.react, ...props };
  const { useSuspense, keyPrefix } = i18nOptions;

  // prepare having a namespace
  let namespaces = ns || defaultNSFromContext || (i18n.options && i18n.options.defaultNS);
  namespaces = typeof namespaces === 'string' ? [namespaces] : namespaces || ['translation'];

  // report namespaces as used
  if (i18n.reportNamespaces.addUsedNamespaces) i18n.reportNamespaces.addUsedNamespaces(namespaces);

  // are we ready? yes if all namespaces in first language are loaded already (either with data or empty object on failed load)
  const ready =
    (i18n.isInitialized || i18n.initializedStoreOnce) &&
    namespaces.every((n) => hasLoadedNamespace(n, i18n, i18nOptions));

  // binding t function to namespace (acts also as rerender trigger *when* args have changed)
  const memoGetT = useMemoizedT(
    i18n,
    props.lng || null,
    i18nOptions.nsMode === 'fallback' ? namespaces : namespaces[0],
    keyPrefix,
  );
  // using useState with a function expects an initializer, not the function itself:
  const getT = () => memoGetT;

  console.log('useState(getT())');
  console.log(getT);
  console.log(getT());
  // const [t, setT] = useState(()=>getT);
  const [t, setT] = useState(getT);

  let joinedNS = namespaces.join();
  if (props.lng) joinedNS = `${props.lng}${joinedNS}`;
  const previousJoinedNS = usePrevious(joinedNS);

  const isMounted = useRef(true);
  useEffect(() => {
    const { bindI18n, bindI18nStore } = i18nOptions;
    isMounted.current = true;

    // if not ready and not using suspense load the namespaces
    // in side effect and do not call resetT if unmounted
    if (!ready && !useSuspense) {
      console.log('!ready !useSuspense');
      if (props.lng) {
        console.log('!ready !useSuspense props.lng');
        loadLanguages(i18n, props.lng, namespaces, () => {
          if (isMounted.current) {
            console.log('1');
            // setT(()=>getT);
            setT(getT);
          }
        });
      } else {
        console.log('!ready !useSuspense !props.lng');
        loadNamespaces(i18n, namespaces, () => {
          console.log('!ready !useSuspense !props.lng loadNamespacesCallback');
          if (isMounted.current) {
            console.log('2');
            // despite that no memoization arguments changed, supply always new T to trigger rerender
            setT(() =>
              alwaysNewT(
                i18n,
                props.lng || null,
                i18nOptions.nsMode === 'fallback' ? namespaces : namespaces[0],
                keyPrefix,
              ),
            );
          }
        });
      }
    }

    if (ready && previousJoinedNS && previousJoinedNS !== joinedNS && isMounted.current) {
      console.log('3');
      setT(getT);
      // setT(()=>getT);
    }

    function boundReset() {
      if (isMounted.current) {
        console.log('4');
        setT(getT);
        // setT(()=>getT);
      }
    }

    // bind events to trigger change, like languageChanged
    if (bindI18n && i18n) i18n.on(bindI18n, boundReset);
    if (bindI18nStore && i18n) i18n.store.on(bindI18nStore, boundReset);

    // unbinding on unmount
    return () => {
      isMounted.current = false;
      if (bindI18n && i18n) bindI18n.split(' ').forEach((e) => i18n.off(e, boundReset));
      if (bindI18nStore && i18n)
        bindI18nStore.split(' ').forEach((e) => i18n.store.off(e, boundReset));
    };
  }, [i18n, joinedNS]); // re-run effect whenever list of namespaces changes

  // t is correctly initialized by useState hook. We only need to update it after i18n
  // instance was replaced (for example in the provider).
  const isInitial = useRef(true);
  useEffect(() => {
    console.log('8:09 before');
    if (isMounted.current && !isInitial.current) {
      console.log('8:09 inside');
      setT(getT);
      // setT(()=>getT);
    }
    isInitial.current = false;
  }, [i18n, keyPrefix]); // re-run when i18n instance or keyPrefix were replaced

  const ret = [t, i18n, ready];
  ret.t = t;
  ret.i18n = i18n;
  ret.ready = ready;

  // return hook stuff if ready
  if (ready) {
    console.log('returning 0', ret.t);
    return ret;
  }

  // not yet loaded namespaces -> load them -> and return if useSuspense option set false
  if (!ready && !useSuspense) {
    console.log('returning 1');
    return ret;
  }

  // not yet loaded namespaces -> load them -> and trigger suspense
  throw new Promise((resolve) => {
    if (props.lng) {
      loadLanguages(i18n, props.lng, namespaces, () => resolve());
    } else {
      loadNamespaces(i18n, namespaces, () => resolve());
    }
  });
}
