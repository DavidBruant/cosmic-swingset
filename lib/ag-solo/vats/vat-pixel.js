import harden from '@agoric/harden';
import { makeHandoffService } from '@agoric/ertp/more/handoff/handoff';
import { makeGallery } from '@agoric/ertp/more/pixels/gallery';
import pubsub from './pubsub';

function build(E, log) {
  let sharedGalleryUserFacet;
  let sharedHandoffService;
  let sharedDustIssuer;
  let contractHost;

  const { publish: stateChangeHandler, subscribe } = pubsub(E);
  const canvasStatePublisher = { subscribe };

  let sharedGuess 

  async function startup(host) {
    // define shared resources

    const canvasSize = 10;
    const gallery = await makeGallery(
      E,
      log,
      host,
      stateChangeHandler,
      canvasSize,
    );
    sharedGalleryUserFacet = gallery.userFacet;
    // TODO: This initial state change may go in the gallery code eventually.
    stateChangeHandler(await E(gallery.readFacet).getState());
    const issuers = await E(gallery.userFacet).getIssuers();
    sharedDustIssuer = issuers.dustIssuer;
    sharedHandoffService = makeHandoffService();
    contractHost = host;
  }

  async function createPixelBundle(_nickname) {
    const gallery = sharedGalleryUserFacet;
    const handoffService = sharedHandoffService;
    const purse = await sharedDustIssuer.makeEmptyPurse();
    const chainBundle = {
      gallery,
      handoffService,
      purse,
      canvasStatePublisher,
      contractHost,
    };
    return harden(chainBundle);
  }

  return harden({ startup, createPixelBundle });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, helpers.log),
    helpers.vatID,
  );
}
